import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { PharmacyOrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { WhatsAppService } from '../prescriptions/whatsapp.service.js';
import { WebPushService } from '../prescriptions/web-push.service.js';
import { RefillOrderDto } from './dto/refill-order.dto.js';
import { PrescriptionFinalizedEvent } from '../prescriptions/events/prescription-finalized.event.js';

export const CHRONIC_REFILL_QUEUE = 'chronic-refill';

export interface ChronicRefillJobPayload {
  prescriptionId: string;
  prescriptionItemId: string;
  patientId: string;
  medicineName: string;
  genericName?: string;
  dosageForm?: string;
  durationDays: number;
  depletionDate: string; // ISO string
  scheduledReminderTime: string; // ISO string
  preferredPharmacyId?: string;
  reorderUrl?: string;
}

export interface RefillScheduleResult {
  prescriptionItemId: string;
  medicineName: string;
  isChronic: boolean;
  durationDays: number;
  depletionDate: Date;
  scheduledReminderTime: Date;
  jobId: string;
  delayMs: number;
}

@Injectable()
export class ChronicRefillService {
  private readonly logger = new Logger(ChronicRefillService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHRONIC_REFILL_QUEUE) private readonly refillQueue: Queue,
    private readonly whatsAppService: WhatsAppService,
    private readonly webPushService: WebPushService,
  ) {}

  /**
   * Check if a prescription item qualifies as chronic maintenance therapy:
   * isChronic: true OR durationDays >= 30
   */
  isChronicEligible(item: {
    isChronic?: boolean;
    durationDays?: number;
  }): boolean {
    if (!item) return false;
    return Boolean(
      item.isChronic === true || (item.durationDays && item.durationDays >= 30),
    );
  }

  /**
   * Calculate exact medicine depletion date: startDate + durationDays (in ms)
   */
  calculateDepletionDate(startDate: Date, durationDays: number): Date {
    const baseTime =
      startDate instanceof Date
        ? startDate.getTime()
        : new Date(startDate).getTime();
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    return new Date(baseTime + durationMs);
  }

  /**
   * Calculate BullMQ reminder schedule time: 72 hours (3 days) prior to depletion date
   */
  calculateReminderScheduleTime(
    depletionDate: Date,
    leadTimeHours: number = 72,
  ): Date {
    const depletionTime =
      depletionDate instanceof Date
        ? depletionDate.getTime()
        : new Date(depletionDate).getTime();
    const leadTimeMs = leadTimeHours * 60 * 60 * 1000;
    return new Date(depletionTime - leadTimeMs);
  }

  /**
   * Schedule a BullMQ job 72 hours prior to medicine depletion
   */
  async scheduleChronicRefillJob(
    payload: ChronicRefillJobPayload,
  ): Promise<Job> {
    const reminderTimestamp = new Date(payload.scheduledReminderTime).getTime();
    const delay = Math.max(0, reminderTimestamp - Date.now());
    const jobId = `chronic-refill-${payload.prescriptionId}-${payload.prescriptionItemId}`;

    // Remove any previously scheduled job with the same ID to prevent duplicates
    try {
      const existingJob = await this.refillQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
      }
    } catch (err: any) {
      this.logger.warn(
        `Could not remove existing BullMQ job ${jobId}: ${err.message}`,
      );
    }

    const job = await this.refillQueue.add(
      'send-chronic-refill-reminder',
      payload,
      {
        jobId,
        delay,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    this.logger.log(
      `Scheduled BullMQ chronic refill reminder job ${jobId} for item ${payload.medicineName} (depletion: ${payload.depletionDate}) with delay ${delay}ms (72h prior)`,
    );

    return job;
  }

  /**
   * Evaluate prescription items for chronic eligibility (isChronic: true or duration >= 30 days),
   * compute depletion dates, and schedule BullMQ jobs 72 hours prior to run-out.
   */
  async evaluateAndSchedulePrescription(
    prescriptionId: string,
    providedItems?: any[],
    startDate: Date = new Date(),
  ): Promise<RefillScheduleResult[]> {
    let prescription: any = null;
    let items: any[] = providedItems || [];

    if (items.length === 0) {
      prescription = await this.prisma.prescription.findUnique({
        where: { id: prescriptionId },
        include: { items: true, patient: true },
      });

      if (!prescription) {
        throw new NotFoundException(
          `Prescription with ID ${prescriptionId} not found`,
        );
      }

      items = prescription.items || [];
    }

    const patientId =
      prescription?.patientId ||
      items[0]?.prescription?.patientId ||
      items[0]?.patientId;
    const scheduledResults: RefillScheduleResult[] = [];

    for (const item of items) {
      if (this.isChronicEligible(item)) {
        const depletionDate = this.calculateDepletionDate(
          startDate,
          item.durationDays,
        );
        const scheduledReminderTime = this.calculateReminderScheduleTime(
          depletionDate,
          72,
        );
        const delayMs = Math.max(
          0,
          scheduledReminderTime.getTime() - Date.now(),
        );
        const reorderUrl = `/api/v1/pharmacy/refill-order?prescriptionId=${prescriptionId}&prescriptionItemId=${item.id}`;

        const payload: ChronicRefillJobPayload = {
          prescriptionId,
          prescriptionItemId: item.id,
          patientId: patientId || item.patientId,
          medicineName: item.medicineName,
          genericName: item.genericName,
          dosageForm: item.dosageForm,
          durationDays: item.durationDays,
          depletionDate: depletionDate.toISOString(),
          scheduledReminderTime: scheduledReminderTime.toISOString(),
          reorderUrl,
        };

        const job = await this.scheduleChronicRefillJob(payload);

        scheduledResults.push({
          prescriptionItemId: item.id,
          medicineName: item.medicineName,
          isChronic: Boolean(item.isChronic || item.durationDays >= 30),
          durationDays: item.durationDays,
          depletionDate,
          scheduledReminderTime,
          jobId: job.id as string,
          delayMs,
        });
      }
    }

    this.logger.log(
      `Evaluated prescription ${prescriptionId}: scheduled ${scheduledResults.length} chronic refill reminder jobs`,
    );

    return scheduledResults;
  }

  /**
   * Event listener: Automatically fires on PrescriptionFinalizedEvent
   */
  @OnEvent('prescription.finalized')
  async handlePrescriptionFinalized(event: PrescriptionFinalizedEvent) {
    this.logger.log(
      `ChronicRefillService handling PrescriptionFinalizedEvent for prescription ${event.prescriptionId}`,
    );

    try {
      const items = event.prescription?.items;
      if (Array.isArray(items) && items.length > 0) {
        await this.evaluateAndSchedulePrescription(
          event.prescriptionId,
          items,
          event.createdAt || new Date(),
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to schedule chronic refill reminders for prescription ${event.prescriptionId}: ${err.message}`,
      );
    }
  }

  /**
   * Resolve patient's preferred partner pharmacy:
   * 1. If explicit pharmacyId provided and valid, use it.
   * 2. Otherwise, check patient's previous PharmacyOrders to find preferred pharmacy.
   * 3. Otherwise, pick first active partner pharmacy with deliveryAvailable: true.
   */
  async resolvePreferredPharmacy(
    patientId: string,
    preferredPharmacyId?: string,
  ) {
    if (preferredPharmacyId) {
      const pharmacy = await this.prisma.pharmacyProfile.findUnique({
        where: { id: preferredPharmacyId },
      });
      if (pharmacy) {
        return pharmacy;
      }
    }

    // Check patient's order history for preferred partner pharmacy
    const lastOrder = await this.prisma.pharmacyOrder.findFirst({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { pharmacy: true },
    });

    if (lastOrder && lastOrder.pharmacy) {
      return lastOrder.pharmacy;
    }

    // Default to the first available partner pharmacy offering delivery
    const defaultPartnerPharmacy = await this.prisma.pharmacyProfile.findFirst({
      where: {
        deliveryAvailable: true,
        deletedAt: null,
      },
    });

    if (defaultPartnerPharmacy) {
      return defaultPartnerPharmacy;
    }

    // Fallback to any registered pharmacy profile
    const anyPharmacy = await this.prisma.pharmacyProfile.findFirst({
      where: { deletedAt: null },
    });

    if (!anyPharmacy) {
      throw new NotFoundException(
        'No active partner pharmacy found in the system to provision order',
      );
    }

    return anyPharmacy;
  }

  /**
   * Resolve shipping address:
   * 1. Provided in DTO
   * 2. Patient's previous PharmacyOrder address
   * 3. Default fallback address
   */
  async resolveShippingAddress(
    patientId: string,
    providedAddress?: string,
  ): Promise<string> {
    if (providedAddress && providedAddress.trim().length > 0) {
      return providedAddress.trim();
    }

    const lastOrder = await this.prisma.pharmacyOrder.findFirst({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOrder && lastOrder.shippingAddress) {
      return lastOrder.shippingAddress;
    }

    return 'Default Patient Residence Address (Dhaka, Bangladesh)';
  }

  /**
   * POST /api/v1/pharmacy/refill-order
   * 1-click re-order endpoint that automatically provisions order with patient's preferred partner pharmacy.
   */
  async provisionRefillOrder(userId: string, dto: RefillOrderDto) {
    // 1. Fetch Patient Profile
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    if (!patientProfile) {
      throw new NotFoundException(
        `Patient profile not found for user ID ${userId}`,
      );
    }

    // 2. Fetch Prescription
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: dto.prescriptionId },
      include: {
        items: true,
        doctor: {
          select: { name: true, specialization: true, bmdcRegNo: true },
        },
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

    // 3. Filter target prescription items to refill
    let refillItems = prescription.items;

    if (dto.prescriptionItemId) {
      refillItems = prescription.items.filter(
        (item) => item.id === dto.prescriptionItemId,
      );
    } else if (dto.selectedItemIds && dto.selectedItemIds.length > 0) {
      refillItems = prescription.items.filter((item) =>
        dto.selectedItemIds!.includes(item.id),
      );
    }

    if (refillItems.length === 0) {
      throw new BadRequestException(
        'No matching prescription items found to refill',
      );
    }

    // 4. Resolve Preferred Partner Pharmacy & Shipping Address
    const partnerPharmacy = await this.resolvePreferredPharmacy(
      patientProfile.id,
      dto.pharmacyId,
    );
    const shippingAddress = await this.resolveShippingAddress(
      patientProfile.id,
      dto.shippingAddress,
    );

    // 5. Calculate Cart Pricing & 30-day Refill Quantities
    let totalAmount = 0;
    const cartItems = refillItems.map((item) => {
      // Doses per day from schedule pattern (e.g. "1+0+1" -> 2)
      const dosesPerDay = item.schedulePattern
        ? item.schedulePattern
            .split(/[\+\-,\/]/)
            .reduce((acc, curr) => acc + (parseInt(curr.trim(), 10) || 0), 0) ||
          2
        : 2;

      // Refill standard 30-day maintenance pack or item duration
      const refillDurationDays =
        item.durationDays >= 30 ? item.durationDays : 30;
      const quantity = Math.max(1, dosesPerDay * refillDurationDays);
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
        refillDurationDays,
        quantity,
        unitPrice,
        itemTotal,
      };
    });

    // Standard Express Delivery fee: 60 BDT
    const deliveryFee = 60;
    totalAmount += deliveryFee;

    // 6. Automatically Provision Pharmacy Order in DB
    const pharmacyOrder = await this.prisma.pharmacyOrder.create({
      data: {
        patientId: patientProfile.id,
        pharmacyId: partnerPharmacy.id,
        prescriptionId: prescription.id,
        itemsJson: cartItems as any,
        totalAmount,
        shippingAddress,
        status: PharmacyOrderStatus.PENDING,
        notes: dto.notes
          ? `[1-Click Chronic Refill] ${dto.notes}`
          : '[1-Click Chronic Refill Auto-Provisioned]',
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            tradeName: true,
            address: true,
            drugLicenseNo: true,
          },
        },
        patient: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
      },
    });

    this.logger.log(
      `Successfully provisioned 1-click refill PharmacyOrder ${pharmacyOrder.id} with partner pharmacy ${partnerPharmacy.tradeName} for patient ${patientProfile.id}`,
    );

    // 7. Schedule next cycle's 72-hour BullMQ refill reminder for the new refill period
    const refillStartDate = new Date();
    for (const item of refillItems) {
      const nextDuration = item.durationDays >= 30 ? item.durationDays : 30;
      const nextDepletionDate = this.calculateDepletionDate(
        refillStartDate,
        nextDuration,
      );
      const nextReminderTime = this.calculateReminderScheduleTime(
        nextDepletionDate,
        72,
      );

      await this.scheduleChronicRefillJob({
        prescriptionId: prescription.id,
        prescriptionItemId: item.id,
        patientId: patientProfile.id,
        medicineName: item.medicineName,
        genericName: item.genericName || undefined,
        dosageForm: item.dosageForm || undefined,
        durationDays: nextDuration,
        depletionDate: nextDepletionDate.toISOString(),
        scheduledReminderTime: nextReminderTime.toISOString(),
        preferredPharmacyId: partnerPharmacy.id,
        reorderUrl: `/api/v1/pharmacy/refill-order?prescriptionId=${prescription.id}&prescriptionItemId=${item.id}`,
      });
    }

    return {
      success: true,
      message: '1-click chronic medicine refill order provisioned successfully',
      order: pharmacyOrder,
      partnerPharmacy: {
        id: partnerPharmacy.id,
        name: partnerPharmacy.tradeName,
        address: partnerPharmacy.address,
      },
      shippingAddress,
      totalAmount,
      deliveryFee,
      items: cartItems,
      refilledPrescriptionId: prescription.id,
    };
  }
}
