import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppointmentStatus, MealTiming } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { VerifyDrugSafetyDto } from './dto/verify-drug-safety.dto.js';
import { DrugSafetyService, DrugSafetyResult } from './drug-safety.service.js';
import { PdfRendererService } from './pdf-renderer.service.js';
import { DosageParserService } from './dosage-parser.service.js';
import { PrescriptionFinalizedEvent } from './events/prescription-finalized.event.js';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly drugSafetyService: DrugSafetyService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly s3Service: S3Service,
    private readonly dosageParserService: DosageParserService,
  ) {}

  /**
   * Event listener: Fires automatically on PrescriptionFinalizedEvent
   * Renders institutional medical PDF, generates cryptographically signed QR code, uploads to S3, and stores presigned URL & hash.
   * Also parses prescription dosage patterns and schedules delayed BullMQ medicine reminders.
   */
  @OnEvent('prescription.finalized')
  async handlePrescriptionFinalized(event: PrescriptionFinalizedEvent) {
    this.logger.log(`Handling PrescriptionFinalizedEvent for prescription ID ${event.prescriptionId}`);
    try {
      await this.generateAndStorePdf(event.prescriptionId, event.prescription);

      if (event.prescription && Array.isArray(event.prescription.items)) {
        for (const item of event.prescription.items) {
          await this.dosageParserService.parseAndScheduleItemReminders({
            patientId: event.patientId,
            prescriptionItemId: item.id,
            schedulePattern: item.schedulePattern || item.frequency || '1+0+1',
            durationDays: item.durationDays,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to handle PDF rendering or reminder scheduling on PrescriptionFinalizedEvent: ${err.message}`);
    }
  }

  /**
   * Render PDF, upload to S3, and update prescription record with hash & presigned URL
   */
  async generateAndStorePdf(prescriptionId: string, prescriptionData?: any) {
    let prescription = prescriptionData;
    if (!prescription) {
      prescription = await this.prisma.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: true,
          doctor: { select: { id: true, name: true, specialization: true, bmdcRegNo: true, hospital: true } },
          patient: { select: { id: true, gender: true, bloodGroup: true, user: { select: { name: true, email: true } } } },
        },
      });
    }

    if (!prescription) {
      throw new NotFoundException(`Prescription ${prescriptionId} not found`);
    }

    // 1. Render PDF layout using PDFKit and generate cryptographic QR code
    const rendered = await this.pdfRendererService.renderPrescriptionPdf(prescription);

    // 2. Upload rendered PDF buffer to private S3 bucket
    const key = `prescriptions/pdf/${prescriptionId}.pdf`;
    const uploadResult = await this.s3Service.uploadBuffer(rendered.pdfBuffer, key, 'application/pdf');

    // 3. Store qrCodeHash and pdfUrl in PostgreSQL
    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        qrCodeHash: rendered.sha256Hash,
        pdfUrl: uploadResult.presignedUrl,
      },
    });

    this.logger.log(
      `Successfully generated & uploaded PDF for prescription ${prescriptionId}. Hash: ${rendered.sha256Hash}`,
    );

    return {
      prescriptionId,
      sha256Hash: rendered.sha256Hash,
      verifyUrl: rendered.verifyUrl,
      pdfUrl: uploadResult.presignedUrl,
    };
  }

  /**
   * POST /prescriptions/verify-safety
   * Cross-reference prescribed medications against known drug interaction database tables and patient allergy list.
   */
  async verifyDrugSafety(dto: VerifyDrugSafetyDto): Promise<DrugSafetyResult> {
    return this.drugSafetyService.verifySafety(dto);
  }

  /**
   * POST /api/v1/prescriptions (Doctor only)
   * 1. Validate that appointment status is IN_PROGRESS
   * 2. Cross-reference drug safety; if SEVERE conflict is flagged, block submission until doctor
   *    submits an electronic override acknowledgement with clinical justification.
   * 3. Save atomically in database
   * 4. Fire PrescriptionFinalizedEvent
   */
  async createPrescription(userId: string, dto: CreatePrescriptionDto) {
    // 1. Fetch Doctor profile for caller
    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctorProfile) {
      throw new NotFoundException(`Doctor profile not found for user ID ${userId}`);
    }

    // 2. Fetch appointment details
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${dto.appointmentId} not found`);
    }

    // 3. Verify that caller is the assigned doctor
    if (appointment.doctorId !== doctorProfile.id) {
      throw new ForbiddenException(
        'Access denied. You are not the assigned doctor for this appointment.',
      );
    }

    // 4. Validate that appointment status is IN_PROGRESS
    if (appointment.status !== AppointmentStatus.IN_PROGRESS) {
      this.logger.warn(
        `Failed prescription creation: appointment ${dto.appointmentId} has status ${appointment.status}, required IN_PROGRESS`,
      );
      throw new BadRequestException(
        `Prescriptions can only be created for appointments in IN_PROGRESS status. Current status is ${appointment.status}.`,
      );
    }

    // 5. Cross-reference drug safety against interactions & patient allergy list
    const safetyResult = await this.drugSafetyService.verifySafety({
      appointmentId: dto.appointmentId,
      patientId: appointment.patientId,
      medicines: dto.items,
    });

    // 6. Block submission if SEVERE conflict is flagged without valid electronic override
    if (safetyResult.severity === 'SEVERE') {
      const override = dto.overrideAcknowledgement;

      if (!override || !override.isAcknowledged || !override.clinicalJustification) {
        this.logger.warn(
          `Prescription submission blocked for appointment ${dto.appointmentId}: severe conflict flagged without electronic override`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message:
            'Prescription submission blocked due to SEVERE drug interaction or allergy conflict. Doctor electronic override acknowledgement with clinical justification is required.',
          safetyResult,
        });
      }

      this.logger.log(
        `Doctor submitted electronic override for appointment ${dto.appointmentId}: "${override.clinicalJustification}"`,
      );
    }

    // 7. Save atomically in database via Prisma transaction
    const prescription = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.prescription.findUnique({
        where: { appointmentId: dto.appointmentId },
      });

      if (existing) {
        throw new ConflictException(
          `A prescription has already been issued for appointment ID ${dto.appointmentId}`,
        );
      }

      const diagnosisStr = Array.isArray(dto.clinicalDiagnosis)
        ? dto.clinicalDiagnosis.join(', ')
        : dto.clinicalDiagnosis;

      const complaintsStr = Array.isArray(dto.chiefComplaints)
        ? dto.chiefComplaints.join(', ')
        : dto.chiefComplaints;

      const createdPrescription = await tx.prescription.create({
        data: {
          appointmentId: dto.appointmentId,
          doctorId: doctorProfile.id,
          patientId: appointment.patientId,
          diagnosis: diagnosisStr,
          chiefComplaints: complaintsStr,
          vitalsJson: dto.vitalsJson ? (dto.vitalsJson as any) : null,
          advice: dto.advice || null,
          followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
          overrideReason: dto.overrideAcknowledgement?.clinicalJustification || null,
          overrideJson: safetyResult ? (safetyResult as any) : null,
          items: {
            create: dto.items.map((item) => ({
              medicineName: item.medicineName,
              genericName: item.genericName || null,
              dosageForm: item.dosageForm || 'Tablet',
              schedulePattern: item.frequency,
              mealTiming: item.mealTiming || MealTiming.AFTER_MEAL,
              durationDays: item.durationDays,
            })),
          },
        },
        include: {
          items: true,
          doctor: {
            select: { id: true, name: true, specialization: true, bmdcRegNo: true, hospital: true },
          },
          patient: {
            select: {
              id: true,
              userId: true,
              gender: true,
              bloodGroup: true,
              user: { select: { name: true, email: true, phone: true } },
            },
          },
        },
      });

      // Update appointment status to COMPLETED
      await tx.appointment.update({
        where: { id: dto.appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      });

      return createdPrescription;
    });

    // 8. Render PDF synchronously or asynchronously and get presigned URL & hash
    const pdfMeta = await this.generateAndStorePdf(prescription.id, prescription);

    const updatedPrescription = {
      ...prescription,
      qrCodeHash: pdfMeta.sha256Hash,
      pdfUrl: pdfMeta.pdfUrl,
      verifyUrl: pdfMeta.verifyUrl,
    };

    // 9. Fire PrescriptionFinalizedEvent
    const finalizedEvent = new PrescriptionFinalizedEvent(
      prescription.id,
      prescription.appointmentId,
      prescription.doctorId,
      prescription.patientId,
      prescription.createdAt,
      updatedPrescription,
    );

    this.eventEmitter.emit('prescription.finalized', finalizedEvent);
    this.logger.log(
      `Prescription ${prescription.id} finalized and PrescriptionFinalizedEvent emitted for appointment ${dto.appointmentId}`,
    );

    return updatedPrescription;
  }

  /**
   * Get prescription by ID
   */
  async getPrescriptionById(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        doctor: { select: { id: true, name: true, specialization: true, bmdcRegNo: true } },
        patient: { select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
      },
    });

    if (!prescription) {
      throw new NotFoundException(`Prescription with ID ${id} not found`);
    }

    return prescription;
  }
}
