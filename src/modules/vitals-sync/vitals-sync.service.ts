import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { VitalsSyncGateway } from './vitals-sync.gateway.js';
import { SyncVitalsDto } from './dto/sync-vitals.dto.js';
import { VitalType, Role } from '@prisma/client';

@Injectable()
export class VitalsSyncService {
  private readonly logger = new Logger(VitalsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vitalsGateway: VitalsSyncGateway,
  ) {}

  /**
   * Bulk ingest biometric vitals with idempotency key handling and emergency alert thresholds
   */
  async syncVitals(
    callerUserId: string,
    callerRole: string,
    dto: SyncVitalsDto,
    headerIdempotencyKey?: string,
  ) {
    const batchIdempotencyKey = dto.idempotencyKey || headerIdempotencyKey;
    const vitalsInput = dto.vitals || [];

    if (!Array.isArray(vitalsInput) || vitalsInput.length === 0) {
      throw new BadRequestException(
        'At least one vital reading must be provided for sync',
      );
    }

    // Resolve caller's patient profile if caller is a PATIENT
    let defaultPatientProfileId: string | null = null;
    if (callerRole === Role.PATIENT) {
      const patientProfile = await this.prisma.patientProfile.findUnique({
        where: { userId: callerUserId },
      });
      if (patientProfile) {
        defaultPatientProfileId = patientProfile.id;
      }
    }

    const savedVitals: any[] = [];
    const triggeredAlerts: any[] = [];
    let skippedDuplicateCount = 0;

    for (let index = 0; index < vitalsInput.length; index++) {
      const item = vitalsInput[index];

      // 1. Resolve patientProfileId for this item
      const patientId = await this.resolvePatientProfileId(
        item.patientId,
        defaultPatientProfileId,
        callerUserId,
      );

      // 2. Generate item idempotency key if batch key provided or item key provided
      const itemKey =
        item.idempotencyKey ||
        (batchIdempotencyKey ? `${batchIdempotencyKey}_${index}` : null);

      // 3. Idempotency check: if already ingested, skip re-ingesting duplicate
      if (itemKey) {
        const existingVital = await this.prisma.biometricVital.findUnique({
          where: { idempotencyKey: itemKey },
        });

        if (existingVital) {
          this.logger.log(
            `Idempotency key match found for key [${itemKey}]. Skipping duplicate insertion.`,
          );
          savedVitals.push(existingVital);
          skippedDuplicateCount++;
          continue;
        }
      }

      // 4. Save BiometricVital to DB
      const recordedAtDate = item.recordedAt
        ? new Date(item.recordedAt)
        : new Date();

      const vitalRecord = await this.prisma.biometricVital.create({
        data: {
          patientId,
          type: item.type,
          value: item.value,
          unit: item.unit,
          recordedAt: recordedAtDate,
          idempotencyKey: itemKey,
        },
      });

      savedVitals.push(vitalRecord);

      // 5. Check Alerting Thresholds:
      // - SpO2 < 92%
      // - Systolic BP > 160
      const alertDetails = this.checkAlertThreshold(
        vitalRecord.type,
        vitalRecord.value,
        vitalRecord.unit,
      );

      if (alertDetails.isTriggered) {
        this.logger.warn(
          `Threshold breached for patient [${patientId}]! Type: ${vitalRecord.type}, Value: ${vitalRecord.value}, Threshold: ${alertDetails.threshold}`,
        );

        // Find assigned cardiologist for this patient
        const assignedCardiologist =
          await this.findAssignedCardiologist(patientId);

        // Fetch patient details for notification
        const patientProfile = await this.prisma.patientProfile.findUnique({
          where: { id: patientId },
          include: {
            user: { select: { name: true, email: true, phone: true } },
          },
        });

        const alertMessage = `Emergency Alert: Patient ${patientProfile?.user?.name || patientId} recorded ${vitalRecord.type} value ${vitalRecord.value}${vitalRecord.unit} (Threshold: ${alertDetails.threshold}).`;

        // Register alert event in DB
        const alertEvent = await this.prisma.vitalAlert.create({
          data: {
            patientId,
            doctorId: assignedCardiologist?.id || null,
            vitalId: vitalRecord.id,
            vitalType: vitalRecord.type,
            value: vitalRecord.value,
            unit: vitalRecord.unit,
            threshold: alertDetails.threshold,
            severity: 'EMERGENCY',
            message: alertMessage,
          },
        });

        triggeredAlerts.push(alertEvent);

        // Trigger emergency alert via WebSockets
        this.vitalsGateway.emitEmergencyAlert({
          alertId: alertEvent.id,
          patientId,
          patientName: patientProfile?.user?.name || null,
          doctorId: assignedCardiologist?.id || null,
          doctorUserId: assignedCardiologist?.userId || null,
          vitalId: vitalRecord.id,
          vitalType: vitalRecord.type,
          value: vitalRecord.value,
          unit: vitalRecord.unit,
          threshold: alertDetails.threshold,
          severity: alertEvent.severity,
          message: alertMessage,
          createdAt: alertEvent.createdAt,
        });
      }
    }

    return {
      success: true,
      syncedCount: savedVitals.length - skippedDuplicateCount,
      skippedDuplicateCount,
      totalProcessed: savedVitals.length,
      alertsTriggeredCount: triggeredAlerts.length,
      vitals: savedVitals,
      alerts: triggeredAlerts,
    };
  }

  /**
   * Evaluate vital threshold rules:
   * 1. SpO2 < 92%
   * 2. Systolic BP > 160
   */
  private checkAlertThreshold(
    type: VitalType,
    value: number,
    unit: string,
  ): { isTriggered: boolean; threshold: string } {
    if (type === VitalType.SPO2 && value < 92) {
      return { isTriggered: true, threshold: 'SpO2 < 92%' };
    }

    if (type === VitalType.BP && value > 160) {
      return { isTriggered: true, threshold: 'Systolic BP > 160' };
    }

    return { isTriggered: false, threshold: '' };
  }

  /**
   * Helper to resolve PatientProfile ID from provided ID (which might be PatientProfile.id or User.id)
   */
  private async resolvePatientProfileId(
    providedId: string | undefined,
    defaultPatientProfileId: string | null,
    callerUserId: string,
  ): Promise<string> {
    if (!providedId) {
      if (defaultPatientProfileId) {
        return defaultPatientProfileId;
      }
      // Check if caller's user ID matches a patient profile
      const callerProfile = await this.prisma.patientProfile.findUnique({
        where: { userId: callerUserId },
      });
      if (callerProfile) {
        return callerProfile.id;
      }
      throw new BadRequestException(
        'patientId is required when syncing vitals for another user or when patient profile does not exist',
      );
    }

    // Try finding PatientProfile by id
    const byProfileId = await this.prisma.patientProfile.findUnique({
      where: { id: providedId },
    });
    if (byProfileId) {
      return byProfileId.id;
    }

    // Try finding PatientProfile by userId
    const byUserId = await this.prisma.patientProfile.findUnique({
      where: { userId: providedId },
    });
    if (byUserId) {
      return byUserId.id;
    }

    throw new NotFoundException(
      `Patient profile not found for ID: ${providedId}`,
    );
  }

  /**
   * Locate the patient's assigned cardiologist:
   * 1. Latest appointment with a cardiologist
   * 2. Latest prescription from a cardiologist
   * 3. Fallback: Any approved cardiologist in the platform
   */
  private async findAssignedCardiologist(patientId: string) {
    // 1. Search Appointment with Cardiology doctor
    const appointmentWithCardiologist = await this.prisma.appointment.findFirst(
      {
        where: {
          patientId,
          doctor: {
            specialization: {
              contains: 'Cardiology',
              mode: 'insensitive',
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { doctor: true },
      },
    );

    if (appointmentWithCardiologist?.doctor) {
      return appointmentWithCardiologist.doctor;
    }

    // 2. Search Prescription with Cardiology doctor
    const prescriptionWithCardiologist =
      await this.prisma.prescription.findFirst({
        where: {
          patientId,
          doctor: {
            specialization: {
              contains: 'Cardiology',
              mode: 'insensitive',
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { doctor: true },
      });

    if (prescriptionWithCardiologist?.doctor) {
      return prescriptionWithCardiologist.doctor;
    }

    // 3. Fallback: Any approved cardiologist in DB
    const anyCardiologist = await this.prisma.doctorProfile.findFirst({
      where: {
        specialization: {
          contains: 'Cardiology',
          mode: 'insensitive',
        },
        isApproved: true,
      },
    });

    if (anyCardiologist) {
      return anyCardiologist;
    }

    // 4. Ultimate fallback: Any cardiologist profile in DB
    return this.prisma.doctorProfile.findFirst({
      where: {
        specialization: {
          contains: 'Cardiology',
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Retrieve synced vitals for a patient
   */
  async getPatientVitals(patientId: string, limit = 50) {
    return this.prisma.biometricVital.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Retrieve triggered alerts for a patient or doctor
   */
  async getAlerts(filter: { patientId?: string; doctorId?: string }) {
    return this.prisma.vitalAlert.findMany({
      where: {
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.doctorId ? { doctorId: filter.doctorId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        vital: true,
        patient: {
          include: {
            user: { select: { name: true, email: true, phone: true } },
          },
        },
        doctor: { select: { id: true, name: true, specialization: true } },
      },
    });
  }
}
