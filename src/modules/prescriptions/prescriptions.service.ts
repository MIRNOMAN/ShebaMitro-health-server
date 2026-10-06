import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentStatus, MealTiming } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { PrescriptionFinalizedEvent } from './events/prescription-finalized.event.js';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * POST /api/v1/prescriptions (Doctor only)
   * 1. Validate that appointment status is IN_PROGRESS
   * 2. Accept CreatePrescriptionDto (chiefComplaints[], clinicalDiagnosis[], vitalsJson, advice, followUpDate, items[])
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

    // 5. Save atomically in database via Prisma transaction
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
            select: { id: true, name: true, specialization: true },
          },
          patient: {
            select: {
              id: true,
              userId: true,
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

    // 6. Fire PrescriptionFinalizedEvent
    const finalizedEvent = new PrescriptionFinalizedEvent(
      prescription.id,
      prescription.appointmentId,
      prescription.doctorId,
      prescription.patientId,
      prescription.createdAt,
      prescription,
    );

    this.eventEmitter.emit('prescription.finalized', finalizedEvent);
    this.logger.log(
      `Prescription ${prescription.id} finalized and PrescriptionFinalizedEvent emitted for appointment ${dto.appointmentId}`,
    );

    return prescription;
  }

  /**
   * Get prescription by ID
   */
  async getPrescriptionById(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        doctor: { select: { id: true, name: true, specialization: true } },
        patient: { select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
      },
    });

    if (!prescription) {
      throw new NotFoundException(`Prescription with ID ${id} not found`);
    }

    return prescription;
  }
}
