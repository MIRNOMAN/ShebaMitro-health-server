import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LabOrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { FilterLabTestsDto } from './dto/filter-lab-tests.dto.js';
import { CreateLabOrderDto } from './dto/create-lab-order.dto.js';
import { AssignTechnicianDto } from './dto/assign-technician.dto.js';
import { LabReportCryptoService } from './lab-report-crypto.service.js';

@Injectable()
export class LabsService {
  private readonly logger = new Logger(LabsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly cryptoService: LabReportCryptoService,
  ) {}

  /**
   * GET /api/v1/labs/tests
   * Full-text search and multi-criteria filtering for lab diagnostic tests
   */
  async searchLabTests(dto: FilterLabTestsDto) {
    const {
      search,
      category,
      fastingRequired,
      turnaroundTime,
      minPrice,
      maxPrice,
      labAccreditation,
      page = 1,
      limit = 10,
    } = dto;

    const skip = (page - 1) * limit;

    // Build dynamic Prisma filter clauses
    const where: any = {};

    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (fastingRequired !== undefined) {
      where.fastingRequired = fastingRequired;
    }

    if (turnaroundTime !== undefined) {
      where.turnaroundHours = { lte: turnaroundTime };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (labAccreditation) {
      where.OR = [
        { labAccreditation: { contains: labAccreditation, mode: 'insensitive' } },
        { lab: { accreditation: { contains: labAccreditation, mode: 'insensitive' } } },
      ];
    }

    if (search) {
      const searchClause = [
        { testName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { lab: { labName: { contains: search, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchClause }];
        delete where.OR;
      } else {
        where.OR = searchClause;
      }
    }

    const [tests, total] = await Promise.all([
      this.prisma.labTest.findMany({
        where,
        include: {
          lab: {
            select: {
              id: true,
              labName: true,
              licenseNo: true,
              address: true,
              accreditation: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { price: 'asc' },
      }),
      this.prisma.labTest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    this.logger.log(
      `Lab tests search query returned ${tests.length} tests (total ${total}) on page ${page}`,
    );

    return {
      data: tests,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * POST /api/v1/labs/orders
   * Book home sample collection for diagnostic lab tests
   */
  async createLabOrder(userId: string, dto: CreateLabOrderDto) {
    // 1. Fetch Patient profile for caller
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      throw new NotFoundException(`Patient profile not found for user ID ${userId}`);
    }

    // 2. Verify Diagnostic Lab Profile
    const labProfile = await this.prisma.labProfile.findUnique({
      where: { id: dto.labId },
    });

    if (!labProfile) {
      throw new NotFoundException(`Lab Profile with ID ${dto.labId} not found`);
    }

    // 3. Calculate total fee based on requested tests
    const matchingTests = await this.prisma.labTest.findMany({
      where: {
        labId: dto.labId,
        testName: { in: dto.testNames },
      },
    });

    let calculatedFee = 0;
    if (matchingTests.length > 0) {
      calculatedFee = matchingTests.reduce((sum, test) => sum + test.price, 0);
    } else {
      // Fallback base rate per test if test records not pre-populated in DB
      calculatedFee = dto.testNames.length * 500;
    }

    // Add home sample collection surcharge (e.g. 150 BDT)
    calculatedFee += 150;

    // 4. Create LabOrder record in DB
    const createdOrder = await this.prisma.labOrder.create({
      data: {
        patientId: patientProfile.id,
        labId: dto.labId,
        prescriptionId: dto.prescriptionId || null,
        testNames: dto.testNames,
        totalFee: calculatedFee,
        sampleCollectionAddress: dto.sampleCollectionAddress,
        sampleCollectionSlot: new Date(dto.sampleCollectionSlot),
        status: LabOrderStatus.PENDING,
        notes: dto.notes || null,
      },
      include: {
        lab: { select: { id: true, labName: true, address: true } },
        patient: {
          select: {
            id: true,
            user: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    this.logger.log(
      `Successfully created home sample collection LabOrder ${createdOrder.id} for patient ${patientProfile.id}`,
    );

    return createdOrder;
  }

  /**
   * PUT /api/v1/labs/orders/:id/assign-technician
   * Dispatch a phlebotomist with geolocation coordinates
   */
  async assignTechnician(orderId: string, dto: AssignTechnicianDto) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    const updatedOrder = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        technicianName: dto.technicianName,
        technicianPhone: dto.technicianPhone,
        technicianLatitude: dto.latitude,
        technicianLongitude: dto.longitude,
        status: LabOrderStatus.SAMPLE_COLLECTED,
      },
      include: {
        patient: { select: { id: true, user: { select: { name: true, phone: true } } } },
        lab: { select: { id: true, labName: true } },
      },
    });

    this.logger.log(
      `Dispatched phlebotomist ${dto.technicianName} (${dto.technicianPhone}) to LabOrder ${orderId} at coords [${dto.latitude}, ${dto.longitude}]`,
    );

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      dispatchedTechnician: {
        name: updatedOrder.technicianName,
        phone: updatedOrder.technicianPhone,
        location: {
          latitude: updatedOrder.technicianLatitude,
          longitude: updatedOrder.technicianLongitude,
        },
        dispatchedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * POST /api/v1/labs/orders/:id/upload-report
   * Upload lab report PDF with encryption and patient SMS notification dispatch
   */
  async uploadReport(orderId: string, file?: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid PDF report file is required for upload');
    }

    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        patient: { select: { id: true, user: { select: { name: true, phone: true } } } },
        lab: { select: { id: true, labName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    // 1. Encrypt PDF report buffer using AES-256-GCM authenticated encryption
    const encryptedResult = this.cryptoService.encryptPdfBuffer(file.buffer);

    // 2. Upload encrypted PDF buffer to private S3 bucket
    const key = `lab-reports/${order.labId}/${orderId}_encrypted.pdf`;
    const uploadResult = await this.s3Service.uploadBuffer(
      encryptedResult.encryptedBuffer,
      key,
      'application/pdf',
    );

    // 3. Update LabOrder record in DB
    const updatedOrder = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        reportPdfUrl: uploadResult.presignedUrl,
        isEncrypted: true,
        status: LabOrderStatus.REPORT_READY,
      },
    });

    // 4. Dispatch patient SMS notification
    const patientName = order.patient?.user?.name || 'Patient';
    const patientPhone = order.patient?.user?.phone || '8801700000000';

    const smsResult = await this.cryptoService.dispatchPatientSms({
      patientName,
      patientPhone,
      orderId,
      reportUrl: uploadResult.presignedUrl,
    });

    this.logger.log(
      `Successfully uploaded encrypted lab report PDF for order ${orderId} and dispatched patient SMS`,
    );

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      reportPdfUrl: uploadResult.presignedUrl,
      isEncrypted: true,
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        iv: encryptedResult.ivHex,
        authTag: encryptedResult.authTagHex,
      },
      smsDispatch: smsResult,
    };
  }
}
