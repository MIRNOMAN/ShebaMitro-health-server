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

import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redlockService: RedlockService,
    @Inject(forwardRef(() => AppointmentsQueueService))
    private readonly queueService: AppointmentsQueueService,
    private readonly gateway: AppointmentsGateway,
    private readonly notificationsService: NotificationsService,
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

    // 5. Send automated confirmation SMS & Email notification to client
    let notifications: any = null;
    try {
      notifications =
        await this.notificationsService.sendAppointmentConfirmationNotification(
          {
            appointmentId: createdAppointment.id,
            patientName:
              createdAppointment.patient?.user?.name || 'Valued Patient',
            patientEmail: createdAppointment.patient?.user?.email,
            patientPhone: createdAppointment.patient?.user?.phone,
            doctorName: createdAppointment.doctor?.name || 'Doctor',
            doctorSpecialization:
              createdAppointment.doctor?.specialization || 'Specialist',
            slotStartTime: createdAppointment.slotStartTime,
            slotEndTime: createdAppointment.slotEndTime,
            chamberName:
              createdAppointment.notes || 'ShebaMitro Virtual Chamber',
            consultFee: createdAppointment.doctor?.consultFee || 1200,
            type: createdAppointment.type,
          },
        );
    } catch (notifErr: any) {
      this.logger.warn(
        `Failed to dispatch appointment notifications: ${notifErr.message}`,
      );
    }

    return {
      ...createdAppointment,
      paymentGracePeriodMinutes: 10,
      paymentExpiresAt: new Date(Date.now() + gracePeriodMs).toISOString(),
      notifications,
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
            hospital: true,
            bmdcRegNo: true,
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
   * Get all appointments for a patient (with demo fallback)
   */
  async getPatientAppointments(userId?: string) {
    let patientProfile: any = null;
    if (userId) {
      patientProfile = await this.prisma.patientProfile.findUnique({
        where: { userId },
      });
    }

    if (!patientProfile) {
      patientProfile = await this.prisma.patientProfile.findFirst({
        where: { deletedAt: null },
      });
    }

    if (!patientProfile) {
      return [];
    }

    return this.prisma.appointment.findMany({
      where: { patientId: patientProfile.id },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            hospital: true,
            consultFee: true,
            rating: true,
          },
        },
      },
      orderBy: { slotStartTime: 'desc' },
    });
  }

  /**
   * Get appointments for a doctor OPD live queue
   */
  async getDoctorAppointments(userId?: string, doctorIdQuery?: string) {
    let doctorId = doctorIdQuery;

    if (!doctorId && userId) {
      const docProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });
      if (docProfile) {
        doctorId = docProfile.id;
      }
    }

    if (!doctorId) {
      const demoUser = await this.prisma.user.findFirst({
        where: { email: 'doctor@shebamitro.health' },
        include: { doctorProfile: true },
      });
      if (demoUser?.doctorProfile) {
        doctorId = demoUser.doctorProfile.id;
      } else {
        const docWithAppts = await this.prisma.appointment.findFirst({
          select: { doctorId: true },
        });
        if (docWithAppts) {
          doctorId = docWithAppts.doctorId;
        } else {
          const defaultDoc = await this.prisma.doctorProfile.findFirst({
            where: { deletedAt: null },
            orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
          });
          if (defaultDoc) {
            doctorId = defaultDoc.id;
          }
        }
      }
    }

    const where: any = {};
    if (doctorId) {
      where.doctorId = doctorId;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            hospital: true,
            consultFee: true,
          },
        },
        patient: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
            biometricVitals: {
              orderBy: { recordedAt: 'desc' },
              take: 4,
            },
          },
        },
      },
      orderBy: { slotStartTime: 'asc' },
    });

    const formattedQueue = appointments.map((appt, index) => {
      const pUser = appt.patient?.user;
      const patientName =
        pUser?.name || `Patient #${appt.patientId.slice(0, 6)}`;

      let age = 38;
      if (appt.patient?.dob) {
        const diffMs = Date.now() - new Date(appt.patient.dob).getTime();
        age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
      }

      let queueStatus: 'waiting' | 'consulting' | 'completed' = 'waiting';
      if (appt.status === AppointmentStatus.IN_PROGRESS) {
        queueStatus = 'consulting';
      } else if (appt.status === AppointmentStatus.COMPLETED) {
        queueStatus = 'completed';
      } else {
        queueStatus = 'waiting';
      }

      const slotDate = new Date(appt.slotStartTime);
      const hours = slotDate.getHours();
      const minutes = slotDate.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
      const appointmentTime = `${formattedHours}:${minutes} ${ampm}`;

      const vitalsMap: Record<string, string> = {};
      appt.patient?.biometricVitals?.forEach((v) => {
        if (v.type === 'BP') vitalsMap.bp = `${v.value} mmHg`;
        if (v.type === 'HEART_RATE') vitalsMap.pulse = `${v.value} bpm`;
        if (v.type === 'SPO2') vitalsMap.spo2 = `${v.value}%`;
      });

      return {
        id: appt.id,
        appointmentId: `APT-${appt.id.slice(0, 6).toUpperCase()}`,
        name: patientName,
        age,
        gender: (appt.patient?.gender || 'Male') as 'Male' | 'Female' | 'Other',
        chiefComplaint:
          appt.notes || 'General clinical review and prescription refill',
        consultationMode: (appt.type === AppointmentType.ONLINE
          ? 'Video'
          : 'Chamber') as 'Video' | 'Chamber',
        status: queueStatus,
        rawStatus: appt.status,
        queueNumber: index + 1,
        appointmentTime,
        phone: pUser?.phone || '+880 1712-000000',
        bloodGroup: appt.patient?.bloodGroup || 'O+',
        allergies: appt.patient?.medicalAllergies || [],
        vitalStats: {
          bp: vitalsMap.bp || '120/80 mmHg',
          pulse: vitalsMap.pulse || '76 bpm',
          weight: '68 kg',
          temperature: '98.6 °F',
        },
        pastHistory: [
          { condition: 'Routine health screening', diagnosedYear: '2025' },
        ],
        doctor: appt.doctor,
        slotStartTime: appt.slotStartTime,
        slotEndTime: appt.slotEndTime,
      };
    });

    return formattedQueue;
  }

  /**
   * Update appointment status (called by doctor queue: e.g. IN_PROGRESS, COMPLETED)
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
  ) {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Appointment with ID ${appointmentId} not found`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: {
        doctor: { select: { id: true, name: true, specialization: true } },
        patient: { select: { id: true, userId: true } },
      },
    });

    this.gateway.emitAppointmentNotification('APPOINTMENT_STATUS_UPDATED', {
      appointmentId: updated.id,
      status: updated.status,
      doctorId: updated.doctorId,
      patientId: updated.patientId,
    });

    return updated;
  }

  /**
   * Get doctor dashboard stats
   */
  async getDoctorStats(userId?: string, doctorIdQuery?: string) {
    let doctorId = doctorIdQuery;

    if (!doctorId && userId) {
      const doc = await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });
      if (doc) doctorId = doc.id;
    }

    if (!doctorId) {
      const demoUser = await this.prisma.user.findFirst({
        where: { email: 'doctor@shebamitro.health' },
        include: { doctorProfile: true },
      });
      if (demoUser?.doctorProfile) {
        doctorId = demoUser.doctorProfile.id;
      } else {
        const docWithAppts = await this.prisma.appointment.findFirst({
          select: { doctorId: true },
        });
        if (docWithAppts) {
          doctorId = docWithAppts.doctorId;
        } else {
          const defaultDoc = await this.prisma.doctorProfile.findFirst({
            where: { deletedAt: null },
            orderBy: [{ rating: 'desc' }],
          });
          if (defaultDoc) doctorId = defaultDoc.id;
        }
      }
    }

    const where: any = {};
    if (doctorId) {
      where.doctorId = doctorId;
    }

    const [total, waiting, consulting, completed, doctor] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.count({
        where: {
          ...where,
          status: {
            in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
          },
        },
      }),
      this.prisma.appointment.count({
        where: { ...where, status: AppointmentStatus.IN_PROGRESS },
      }),
      this.prisma.appointment.count({
        where: { ...where, status: AppointmentStatus.COMPLETED },
      }),
      doctorId
        ? this.prisma.doctorProfile.findUnique({
            where: { id: doctorId },
            include: { user: { select: { name: true, email: true } } },
          })
        : null,
    ]);

    const consultFee = doctor?.consultFee || 1000;
    const estimatedRevenue = completed * consultFee;

    return {
      total,
      waiting,
      consulting,
      completed,
      estimatedRevenue,
      doctor: doctor
        ? {
            id: doctor.id,
            name: doctor.name || doctor.user?.name || 'Dr. Specialist',
            specialization: doctor.specialization,
            hospital: doctor.hospital || 'ShebaMitro Specialized Hospital',
            bmdcRegNo: doctor.bmdcRegNo,
            rating: doctor.rating,
          }
        : null,
    };
  }
}
