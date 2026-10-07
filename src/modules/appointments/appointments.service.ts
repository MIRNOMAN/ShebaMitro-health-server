import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentStatus,
  AppointmentType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RedlockService } from './redlock.service.js';
import { AppointmentsQueueService } from './appointments-queue.service.js';
import { AppointmentsGateway } from './appointments.gateway.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redlockService: RedlockService,
    @Inject(forwardRef(() => AppointmentsQueueService))
    private readonly queueService: AppointmentsQueueService,
    private readonly gateway: AppointmentsGateway,
  ) {}

  /**
   * POST /appointments for Patients
   * 1. Acquire Redlock lock on "lock:doctor:{doctorId}:slot:{slotTime}"
   * 2. In a Prisma transaction:
   *    - Verify availability
   *    - Set appointment status to PENDING with a 10-minute payment grace period
   * 3. Record appointment expiration job in BullMQ
   */
  async createAppointment(userId: string, dto: CreateAppointmentDto) {
    const slotStart = new Date(dto.slotStartTime);
    const slotEnd = new Date(dto.slotEndTime);

    if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
      throw new BadRequestException(
        'Invalid slotStartTime or slotEndTime format',
      );
    }

    if (slotEnd <= slotStart) {
      throw new BadRequestException('slotEndTime must be after slotStartTime');
    }

    const slotTimeFormatted = slotStart.toISOString();
    const lockKeyResource = `lock:doctor:${dto.doctorId}:slot:${slotTimeFormatted}`;

    // 1. Acquire distributed lock via Redlock
    const lockHandle = await this.redlockService.acquireDoctorSlotLock(
      dto.doctorId,
      slotTimeFormatted,
      5000,
    );

    let createdAppointment: any;

    try {
      // 2. Prisma transaction for atomic availability verification & booking
      createdAppointment = await this.prisma.$transaction(async (tx) => {
        // a. Verify Doctor exists
        const doctor = await tx.doctorProfile.findUnique({
          where: { id: dto.doctorId },
        });

        if (!doctor || doctor.deletedAt) {
          throw new NotFoundException(
            `Doctor with ID ${dto.doctorId} not found`,
          );
        }

        // b. Verify Patient profile exists for authenticated user
        const patientProfile = await tx.patientProfile.findUnique({
          where: { userId },
        });

        if (!patientProfile || patientProfile.deletedAt) {
          throw new NotFoundException(
            `Patient profile not found for user ID ${userId}`,
          );
        }

        // c. Check if doctor already has an active appointment at this slotStartTime
        const existingDocAppt = await tx.appointment.findFirst({
          where: {
            doctorId: dto.doctorId,
            slotStartTime: slotStart,
          },
        });

        if (existingDocAppt) {
          if (
            existingDocAppt.status === AppointmentStatus.PENDING ||
            existingDocAppt.status === AppointmentStatus.CONFIRMED ||
            existingDocAppt.status === AppointmentStatus.COMPLETED
          ) {
            throw new ConflictException(
              `The slot at ${slotTimeFormatted} is already booked or reserved for this doctor`,
            );
          }

          // If previously cancelled, delete the record to clean unique constraint collision
          if (existingDocAppt.status === AppointmentStatus.CANCELLED) {
            await tx.appointment.delete({
              where: { id: existingDocAppt.id },
            });
          }
        }

        // d. Check if patient already has an active appointment at the exact same time
        const existingPatientAppt = await tx.appointment.findFirst({
          where: {
            patientId: patientProfile.id,
            slotStartTime: slotStart,
            status: {
              in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
            },
          },
        });

        if (existingPatientAppt) {
          throw new BadRequestException(
            `Patient already has an active appointment at ${slotTimeFormatted}`,
          );
        }

        // e. Create Appointment with status PENDING and paymentStatus UNPAID
        const appointment = await tx.appointment.create({
          data: {
            doctorId: dto.doctorId,
            patientId: patientProfile.id,
            slotStartTime: slotStart,
            slotEndTime: slotEnd,
            type: dto.type || AppointmentType.ONLINE,
            status: AppointmentStatus.PENDING,
            paymentStatus: PaymentStatus.UNPAID,
            notes: dto.notes || null,
          },
          include: {
            doctor: {
              select: {
                id: true,
                name: true,
                specialization: true,
                consultFee: true,
              },
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

        return appointment;
      });
    } finally {
      // Release Redlock lock regardless of transaction success or failure
      await lockHandle.release();
    }

    // 3. Record appointment expiration job in BullMQ (10-minute payment grace period)
    const gracePeriodMs = 10 * 60 * 1000;
    await this.queueService.addExpirationJob(
      createdAppointment.id,
      gracePeriodMs,
    );

    // 4. Emit WebSocket notification for appointment pending creation
    this.gateway.emitAppointmentNotification('APPOINTMENT_PENDING', {
      appointmentId: createdAppointment.id,
      status: AppointmentStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      doctorId: createdAppointment.doctorId,
      patientId: createdAppointment.patientId,
      slotStartTime: createdAppointment.slotStartTime,
      expiresAt: new Date(Date.now() + gracePeriodMs).toISOString(),
    });

    this.logger.log(
      `Appointment ${createdAppointment.id} created with PENDING status and 10-minute grace period`,
    );

    return {
      ...createdAppointment,
      paymentGracePeriodMinutes: 10,
      paymentExpiresAt: new Date(Date.now() + gracePeriodMs).toISOString(),
    };
  }

  /**
   * Confirm Payment -> transition status from PENDING to CONFIRMED
   */
  async confirmPayment(appointmentId: string, userId?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { userId: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID ${appointmentId} not found`,
      );
    }

    if (userId && appointment.patient.userId !== userId) {
      throw new BadRequestException(
        'You are not authorized to confirm payment for this appointment',
      );
    }

    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm payment for appointment in status: ${appointment.status}`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      },
      include: {
        doctor: { select: { id: true, name: true, specialization: true } },
        patient: { select: { id: true, userId: true } },
      },
    });

    // Remove BullMQ expiration job
    await this.queueService.removeExpirationJob(appointmentId);

    // Emit WebSocket notification
    this.gateway.emitAppointmentNotification('APPOINTMENT_CONFIRMED', {
      appointmentId: updated.id,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      doctorId: updated.doctorId,
      patientId: updated.patientId,
      slotStartTime: updated.slotStartTime,
    });

    this.logger.log(
      `Appointment ${appointmentId} confirmed after successful payment`,
    );

    return updated;
  }

  /**
   * Handle expired appointment (called by BullMQ worker after 10-minute grace period)
   */
  async handleExpiredAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) return;

    if (
      appointment.status === AppointmentStatus.PENDING &&
      appointment.paymentStatus === PaymentStatus.UNPAID
    ) {
      const updated = await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
        },
      });

      // Emit WebSocket notification for automatic slot release & expiration
      this.gateway.emitAppointmentNotification('APPOINTMENT_EXPIRED', {
        appointmentId: updated.id,
        status: AppointmentStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        reason: 'Payment grace period expired (10 minutes)',
        doctorId: updated.doctorId,
        patientId: updated.patientId,
        slotStartTime: updated.slotStartTime,
      });

      this.logger.log(
        `Appointment ${appointmentId} expired due to unpaid status. Slot automatically released.`,
      );
    }
  }

  /**
   * Get appointment details by ID
   */
  async getAppointmentById(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            consultFee: true,
          },
        },
        patient: {
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID ${appointmentId} not found`,
      );
    }

    return appointment;
  }

  /**
   * Get all appointments for a patient
   */
  async getPatientAppointments(userId: string) {
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      throw new NotFoundException(
        `Patient profile not found for user ID ${userId}`,
      );
    }

    return this.prisma.appointment.findMany({
      where: { patientId: patientProfile.id },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            consultFee: true,
          },
        },
      },
      orderBy: { slotStartTime: 'desc' },
    });
  }
}
