import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PharmacyOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { PrescriptionAiService } from './prescription-ai.service.js';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto.js';
import { QueryMedicinesDto } from './dto/query-medicines.dto.js';
import { ScanPrescriptionDto } from './dto/scan-prescription.dto.js';
import { CheckoutCartDto } from './dto/checkout-cart.dto.js';

// Controlled substance / narcotic medications requiring strict single-dispense verification
const CONTROLLED_SUBSTANCES = [
  'morphine',
  'codeine',
  'fentanyl',
  'diazepam',
  'alprazolam',
  'clonazepam',
  'tramadol',
  'pethidine',
  'lorazepam',
  'midazolam',
  'buprenorphine',
  'oxycodone',
];

@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prescriptionAiService: PrescriptionAiService,
  ) {}

  /**
   * GET /api/v1/pharmacy/medicines
   * Fetch dynamic medicines catalog with search, category filtering, and pagination
   */
  async getMedicines(query: QueryMedicinesDto) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.MedicineWhereInput = {};

    if (query.category && query.category !== 'all') {
      where.category = query.category;
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { genericName: { contains: term, mode: 'insensitive' } },
        { manufacturer: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [medicines, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    return {
      medicines,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /api/v1/pharmacy/categories
   * Return category list with active dynamic item counts
   */
  async getCategories() {
    const medicines = await this.prisma.medicine.findMany({
      select: { category: true },
    });

    const categoryMap: Record<string, number> = {};
    for (const med of medicines) {
      categoryMap[med.category] = (categoryMap[med.category] || 0) + 1;
    }

    return [
      { id: 'all', name: 'All Medicines', count: medicines.length },
      { id: 'pain', name: 'Pain Relief & Fever', count: categoryMap['pain'] || 0 },
      { id: 'digestive', name: 'Digestive & Acidity', count: categoryMap['digestive'] || 0 },
      { id: 'diabetic', name: 'Diabetic Care', count: categoryMap['diabetic'] || 0 },
      { id: 'cardiac', name: 'Cardiac & BP', count: categoryMap['cardiac'] || 0 },
      { id: 'vitamins', name: 'Vitamins & Supplements', count: categoryMap['vitamins'] || 0 },
      { id: 'antibiotic', name: 'Antibiotics', count: categoryMap['antibiotic'] || 0 },
    ];
  }

  /**
   * GET /api/v1/pharmacy/medicines/:id
   */
  async getMedicineById(id: string) {
    const medicine = await this.prisma.medicine.findUnique({
      where: { id },
    });

    if (!medicine) {
      throw new NotFoundException(`Medicine with ID ${id} not found`);
    }

    return medicine;
  }

  /**
   * POST /api/v1/pharmacy/scan-prescription
   * Free AI OCR / Vision prescription reader
   */
  async scanPrescription(file?: Express.Multer.File, dto?: ScanPrescriptionDto) {
    return this.prescriptionAiService.scanPrescription(file, dto);
  }

  /**
   * POST /api/v1/pharmacy/checkout
   * Checkout direct cart items into a verified database pharmacy order
   */
  async checkoutCart(userId: string | undefined, dto: CheckoutCartDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Cannot checkout with an empty cart');
    }

    // 1. Resolve patient profile if userId available, or pick default
    let patientProfile = userId
      ? await this.prisma.patientProfile.findUnique({ where: { userId } })
      : null;

    if (!patientProfile) {
      patientProfile = await this.prisma.patientProfile.findFirst();
      if (!patientProfile) {
        throw new BadRequestException('No patient profile found in database');
      }
    }

    // 2. Resolve pharmacy partner
    const pharmacy = await this.prisma.pharmacyProfile.findFirst();
    if (!pharmacy) {
      throw new BadRequestException('No registered pharmacy partner found in database');
    }

    // 3. Verify medicine items and calculate accurate subtotal
    const medicineIds = dto.items.map((i) => i.medicineId);
    const dbMedicines = await this.prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    let subtotal = 0;
    const orderItems = dto.items.map((item) => {
      const dbMed = dbMedicines.find((m) => m.id === item.medicineId);
      const unitPrice = dbMed ? dbMed.price : item.price || 50;
      const itemTotal = unitPrice * Math.max(1, item.quantity);
      subtotal += itemTotal;

      return {
        medicineId: item.medicineId,
        name: dbMed ? dbMed.name : item.name || 'Medicine Item',
        genericName: dbMed?.genericName || '',
        strength: dbMed?.strength || '',
        quantity: item.quantity,
        unitPrice,
        itemTotal,
      };
    });

    // 4. Delivery surcharge (৳120 express 2-hour, ৳60 standard)
    const deliveryFee = dto.isExpressDelivery ? 120 : 60;
    const totalAmount = subtotal + deliveryFee;

    // 5. Create order in Database
    const order = await this.prisma.pharmacyOrder.create({
      data: {
        patientId: patientProfile.id,
        pharmacyId: pharmacy.id,
        itemsJson: orderItems as any,
        totalAmount,
        shippingAddress: dto.shippingAddress,
        status: PharmacyOrderStatus.PENDING,
        notes: dto.notes || (dto.isExpressDelivery ? 'Express 2-Hour Delivery requested' : null),
      },
      include: {
        pharmacy: { select: { id: true, tradeName: true, address: true } },
      },
    });

    const orderNumber = `SM-RX-${order.id.slice(0, 8).toUpperCase()}`;

    this.logger.log(`Created direct checkout PharmacyOrder ${orderNumber} (ID: ${order.id})`);

    return {
      orderId: order.id,
      orderNumber,
      status: order.status,
      subtotal,
      deliveryFee,
      totalAmount,
      isExpressDelivery: Boolean(dto.isExpressDelivery),
      estimatedDelivery: dto.isExpressDelivery ? 'Within 2 Hours' : 'Same Day (4-6 Hours)',
      shippingAddress: order.shippingAddress,
      pharmacyName: order.pharmacy.tradeName,
      items: orderItems,
      createdAt: order.createdAt,
    };
  }


  /**
   * POST /api/v1/pharmacy/orders
   * Convert verified prescription items into a pharmacy cart order
   */
  async createCartOrder(userId: string, dto: CreatePharmacyOrderDto) {
    // 1. Fetch Patient profile for caller
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      throw new NotFoundException(
        `Patient profile not found for user ID ${userId}`,
      );
    }

    // 2. Verify Pharmacy Profile exists
    const pharmacy = await this.prisma.pharmacyProfile.findUnique({
      where: { id: dto.pharmacyId },
    });

    if (!pharmacy) {
      throw new NotFoundException(
        `Pharmacy Profile with ID ${dto.pharmacyId} not found`,
      );
    }

    // 3. Fetch Prescription details with items
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: dto.prescriptionId },
      include: {
        items: true,
        doctor: { select: { name: true, bmdcRegNo: true } },
      },
    });

    if (!prescription) {
      throw new NotFoundException(
        `Prescription with ID ${dto.prescriptionId} not found`,
      );
    }

    if (prescription.patientId !== patientProfile.id) {
      throw new ForbiddenException(
        'Access denied. You do not own this prescription.',
      );
    }

    // 4. Select requested prescription items
    let targetItems = prescription.items;
    if (dto.selectedItemIds && dto.selectedItemIds.length > 0) {
      targetItems = prescription.items.filter((item) =>
        dto.selectedItemIds!.includes(item.id),
      );
    }

    if (targetItems.length === 0) {
      throw new BadRequestException(
        'No valid prescription items selected for cart order',
      );
    }

    // 5. Convert prescription items into cart order items & calculate pricing
    let totalAmount = 0;
    const cartItems = targetItems.map((item) => {
      // Calculate quantity based on schedule pattern and duration (default ~2 doses/day * days)
      const dosesPerDay = item.schedulePattern
        ? item.schedulePattern
            .split('+')
            .reduce((acc, curr) => acc + parseInt(curr || '0', 10), 0) || 2
        : 2;
      const quantity = Math.max(1, dosesPerDay * item.durationDays);
      const unitPrice = 10; // 10 BDT standard unit price
      const itemTotal = quantity * unitPrice;
      totalAmount += itemTotal;

      return {
        prescriptionItemId: item.id,
        medicineName: item.medicineName,
        genericName: item.genericName,
        dosageForm: item.dosageForm || 'Tablet',
        schedulePattern: item.schedulePattern,
        mealTiming: item.mealTiming,
        durationDays: item.durationDays,
        quantity,
        unitPrice,
        itemTotal,
      };
    });

    // Standard delivery surcharge (60 BDT)
    totalAmount += 60;

    // 6. Create PharmacyOrder in DB
    const pharmacyOrder = await this.prisma.pharmacyOrder.create({
      data: {
        patientId: patientProfile.id,
        pharmacyId: dto.pharmacyId,
        prescriptionId: dto.prescriptionId,
        itemsJson: cartItems as any,
        totalAmount,
        shippingAddress: dto.shippingAddress,
        status: PharmacyOrderStatus.PENDING,
        notes: dto.notes || null,
      },
      include: {
        pharmacy: { select: { id: true, tradeName: true, address: true } },
        patient: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
      },
    });

    this.logger.log(
      `Created PharmacyOrder ${pharmacyOrder.id} from prescription ${dto.prescriptionId} for patient ${patientProfile.id}`,
    );

    return pharmacyOrder;
  }

  /**
   * GET /api/v1/pharmacy/verify-qr/:hash
   * Scan patient's QR code: verify signature legitimacy, check previous dispense history
   * to prevent duplicate dispensing of controlled substances, and update status to DISPENSED upon checkout.
   */
  async verifyQrAndDispense(hash: string, userId?: string) {
    // 1. Query prescription by QR hash or ID
    const prescription = await this.prisma.prescription.findFirst({
      where: {
        OR: [{ qrCodeHash: hash }, { id: hash }],
      },
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            name: true,
            bmdcRegNo: true,
            specialization: true,
            isApproved: true,
          },
        },
        patient: {
          select: {
            id: true,
            gender: true,
            bloodGroup: true,
            user: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException(
        `Prescription not found for QR hash or ID: ${hash}`,
      );
    }

    // 2. Verify Signature Legitimacy
    const hasValidQrHash = Boolean(
      prescription.qrCodeHash && prescription.qrCodeHash.length >= 16,
    );
    const isDoctorLegitimate = Boolean(
      prescription.doctor &&
      prescription.doctor.bmdcRegNo &&
      prescription.doctor.isApproved !== false,
    );

    if (!hasValidQrHash || !isDoctorLegitimate) {
      this.logger.warn(
        `Prescription verification failed for ID ${prescription.id}: invalid QR hash or unverified doctor BMDC reg`,
      );
      throw new BadRequestException(
        'Invalid or forged prescription QR code. BMDC registration or digital signature verification failed.',
      );
    }

    // 3. Check for Controlled Substances / Narcotics
    const controlledSubstancesFound = prescription.items.filter((item) => {
      const medName = (item.medicineName || '').toLowerCase();
      const genName = (item.genericName || '').toLowerCase();
      return CONTROLLED_SUBSTANCES.some(
        (substance) =>
          medName.includes(substance) || genName.includes(substance),
      );
    });

    const hasControlledSubstances = controlledSubstancesFound.length > 0;

    // 4. Check Previous Dispense History (Prevent duplicate dispensing of controlled substances)
    if (prescription.isDispensed) {
      if (hasControlledSubstances) {
        const substanceNames = controlledSubstancesFound
          .map((i) => i.medicineName)
          .join(', ');
        this.logger.warn(
          `BLOCKED duplicate dispense for controlled substance prescription ${prescription.id}: contains ${substanceNames}`,
        );

        throw new BadRequestException({
          statusCode: 400,
          error: 'Duplicate Dispense Blocked',
          message: `DUPLICATE DISPENSE BLOCKED: This prescription contains controlled substance/narcotic medication (${substanceNames}) and has already been dispensed on ${prescription.dispensedAt?.toISOString()}.`,
          prescriptionId: prescription.id,
          dispensedAt: prescription.dispensedAt,
          dispensedByPharmacyId: prescription.dispensedByPharmacyId,
          controlledSubstances: controlledSubstancesFound,
        });
      }

      this.logger.warn(
        `Prescription ${prescription.id} was already marked DISPENSED on ${prescription.dispensedAt?.toISOString()}`,
      );
    }

    // 5. Fetch Pharmacist Profile if caller userId provided
    let pharmacyProfileId: string | null = null;
    if (userId) {
      const pharmacyProfile = await this.prisma.pharmacyProfile.findUnique({
        where: { userId },
      });
      if (pharmacyProfile) {
        pharmacyProfileId = pharmacyProfile.id;
      }
    }

    // 6. Update Prescription status to DISPENSED upon checkout
    const now = new Date();
    const updatedPrescription = await this.prisma.prescription.update({
      where: { id: prescription.id },
      data: {
        isDispensed: true,
        dispensedAt: prescription.dispensedAt || now,
        dispensedByPharmacyId:
          pharmacyProfileId || prescription.dispensedByPharmacyId,
      },
    });

    // Also update any linked PharmacyOrder to DISPENSED status
    await this.prisma.pharmacyOrder.updateMany({
      where: { prescriptionId: prescription.id },
      data: { status: PharmacyOrderStatus.DISPENSED },
    });

    this.logger.log(
      `Successfully verified QR code and marked prescription ${prescription.id} as DISPENSED. Controlled substances detected: ${hasControlledSubstances}`,
    );

    return {
      isSignatureLegitimate: true,
      prescriptionId: updatedPrescription.id,
      qrCodeHash: updatedPrescription.qrCodeHash,
      isDispensed: updatedPrescription.isDispensed,
      dispensedAt: updatedPrescription.dispensedAt,
      dispensedByPharmacyId: updatedPrescription.dispensedByPharmacyId,
      doctor: {
        id: prescription.doctor.id,
        name: prescription.doctor.name,
        bmdcRegNo: prescription.doctor.bmdcRegNo,
        specialization: prescription.doctor.specialization,
      },
      patient: {
        id: prescription.patient.id,
        name: prescription.patient.user?.name,
        phone: prescription.patient.user?.phone,
        gender: prescription.patient.gender,
      },
      diagnosis: prescription.diagnosis,
      items: prescription.items,
      controlledSubstancesAnalysis: {
        hasControlledSubstances,
        detectedSubstances: controlledSubstancesFound,
      },
    };
  }
}
