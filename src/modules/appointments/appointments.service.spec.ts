import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentStatus,
  AppointmentType,
} from '@prisma/client';
import { AppointmentsService } from './appointments.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RedlockService } from './redlock.service.js';
import { AppointmentsQueueService } from './appointments-queue.service.js';
import { AppointmentsGateway } from './appointments.gateway.js';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prismaService: any;
  let redlockService: any;
  let queueService: any;
  let gateway: any;

  const mockDoctor = {
    id: 'doctor-uuid-1',
    name: 'Dr. Rahat Ali',
    specialization: 'Cardiology',
    consultFee: 1000,
    deletedAt: null,
  };

  const mockPatientProfile = {
    id: 'patient-profile-1',
    userId: 'user-patient-1',
    deletedAt: null,
  };

  const mockAppointment = {
    id: 'appt-uuid-1',
    doctorId: 'doctor-uuid-1',
    patientId: 'patient-profile-1',
    slotStartTime: new Date('2026-10-10T10:00:00.000Z'),
    slotEndTime: new Date('2026-10-10T10:30:00.000Z'),
    type: AppointmentType.ONLINE,
    status: AppointmentStatus.PENDING,
    paymentStatus: PaymentStatus.UNPAID,
    notes: 'Heart checkup',
    doctor: mockDoctor,
    patient: mockPatientProfile,
  };

  const mockReleaseFn = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    mockReleaseFn.mockClear();

    redlockService = {
      acquireDoctorSlotLock: jest.fn().mockResolvedValue({
        release: mockReleaseFn,
      }),
    };

    queueService = {
      addExpirationJob: jest.fn().mockResolvedValue(undefined),
      removeExpirationJob: jest.fn().mockResolvedValue(undefined),
    };

    gateway = {
      emitAppointmentNotification: jest.fn(),
    };

    prismaService = {
      $transaction: jest.fn(async (cb) => {
        return cb(prismaService);
      }),
      doctorProfile: {
        findUnique: jest.fn().mockResolvedValue(mockDoctor),
      },
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(mockAppointment),
        create: jest.fn().mockResolvedValue(mockAppointment),
        update: jest.fn().mockResolvedValue({
          ...mockAppointment,
          status: AppointmentStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: RedlockService, useValue: redlockService },
        { provide: AppointmentsQueueService, useValue: queueService },
        { provide: AppointmentsGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAppointment', () => {
    it('should acquire Redlock lock on lock:doctor:{doctorId}:slot:{slotTime}, verify availability, create PENDING appt, schedule BullMQ job & emit WS event', async () => {
      const dto = {
        doctorId: 'doctor-uuid-1',
        slotStartTime: '2026-10-10T10:00:00.000Z',
        slotEndTime: '2026-10-10T10:30:00.000Z',
        type: AppointmentType.ONLINE,
        notes: 'Heart checkup',
      };

      const result = await service.createAppointment('user-patient-1', dto);

      // Verify Redlock acquired on exact key
      expect(redlockService.acquireDoctorSlotLock).toHaveBeenCalledWith(
        'doctor-uuid-1',
        '2026-10-10T10:00:00.000Z',
        5000,
      );

      // Verify Redlock released
      expect(mockReleaseFn).toHaveBeenCalled();

      // Verify Prisma transaction executed and appointment created
      expect(prismaService.appointment.create).toHaveBeenCalledWith({
        data: {
          doctorId: 'doctor-uuid-1',
          patientId: 'patient-profile-1',
          slotStartTime: new Date(dto.slotStartTime),
          slotEndTime: new Date(dto.slotEndTime),
          type: AppointmentType.ONLINE,
          status: AppointmentStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          notes: 'Heart checkup',
        },
        include: expect.any(Object),
      });

      // Verify 10-minute payment grace period expiration job scheduled in BullMQ
      expect(queueService.addExpirationJob).toHaveBeenCalledWith(
        'appt-uuid-1',
        600000,
      );

      // Verify WebSocket event emitted
      expect(gateway.emitAppointmentNotification).toHaveBeenCalledWith(
        'APPOINTMENT_PENDING',
        expect.objectContaining({
          appointmentId: 'appt-uuid-1',
          status: AppointmentStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
        }),
      );

      expect(result.status).toBe(AppointmentStatus.PENDING);
      expect(result.paymentGracePeriodMinutes).toBe(10);
    });

    it('should throw ConflictException if doctor slot is already booked or reserved', async () => {
      prismaService.appointment.findFirst.mockResolvedValueOnce({
        id: 'existing-appt',
        status: AppointmentStatus.CONFIRMED,
      });

      const dto = {
        doctorId: 'doctor-uuid-1',
        slotStartTime: '2026-10-10T10:00:00.000Z',
        slotEndTime: '2026-10-10T10:30:00.000Z',
      };

      await expect(
        service.createAppointment('user-patient-1', dto),
      ).rejects.toThrow(ConflictException);

      // Verify lock is released even when exception occurs
      expect(mockReleaseFn).toHaveBeenCalled();
    });

    it('should throw NotFoundException if doctor does not exist', async () => {
      prismaService.doctorProfile.findUnique.mockResolvedValueOnce(null);

      const dto = {
        doctorId: 'non-existent-doc',
        slotStartTime: '2026-10-10T10:00:00.000Z',
        slotEndTime: '2026-10-10T10:30:00.000Z',
      };

      await expect(
        service.createAppointment('user-patient-1', dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockReleaseFn).toHaveBeenCalled();
    });
  });

  describe('confirmPayment', () => {
    it('should transition status to CONFIRMED, remove BullMQ expiration job and emit WS event', async () => {
      const result = await service.confirmPayment(
        'appt-uuid-1',
        'user-patient-1',
      );

      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-uuid-1' },
        data: {
          status: AppointmentStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        },
        include: expect.any(Object),
      });

      expect(queueService.removeExpirationJob).toHaveBeenCalledWith(
        'appt-uuid-1',
      );
      expect(gateway.emitAppointmentNotification).toHaveBeenCalledWith(
        'APPOINTMENT_CONFIRMED',
        expect.objectContaining({
          appointmentId: 'appt-uuid-1',
          status: AppointmentStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        }),
      );

      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    });
  });

  describe('handleExpiredAppointment', () => {
    it('should transition UNPAID PENDING appointment to CANCELLED and emit WS notification', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
      });

      prismaService.appointment.update.mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await service.handleExpiredAppointment('appt-uuid-1');

      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-uuid-1' },
        data: { status: AppointmentStatus.CANCELLED },
      });

      expect(gateway.emitAppointmentNotification).toHaveBeenCalledWith(
        'APPOINTMENT_EXPIRED',
        expect.objectContaining({
          appointmentId: 'appt-uuid-1',
          status: AppointmentStatus.CANCELLED,
          reason: expect.stringContaining('expired'),
        }),
      );
    });

    it('should NOT cancel appointment if already CONFIRMED', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      });

      await service.handleExpiredAppointment('appt-uuid-1');

      expect(prismaService.appointment.update).not.toHaveBeenCalled();
    });
  });
});
