import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, MealTiming } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PrescriptionFinalizedEvent } from './events/prescription-finalized.event.js';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prismaService: any;
  let eventEmitter: any;

  const mockDoctorProfile = {
    id: 'doc-profile-1',
    userId: 'user-doc-1',
    name: 'Dr. Rahat Ali',
  };

  const mockAppointment = {
    id: 'appt-123',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    status: AppointmentStatus.IN_PROGRESS,
  };

  const mockCreatedPrescription = {
    id: 'rx-999',
    appointmentId: 'appt-123',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    diagnosis: 'Acute Viral Bronchitis',
    chiefComplaints: 'High fever, Dry cough',
    vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
    advice: 'Rest and drink warm water',
    followUpDate: new Date('2026-10-15T10:00:00.000Z'),
    items: [
      {
        id: 'rx-item-1',
        medicineName: 'Napa Extra',
        genericName: 'Paracetamol + Caffeine',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+1',
        mealTiming: MealTiming.AFTER_MEAL,
        durationDays: 7,
      },
    ],
    createdAt: new Date(),
  };

  beforeEach(async () => {
    eventEmitter = {
      emit: jest.fn(),
    };

    prismaService = {
      $transaction: jest.fn(async (cb) => cb(prismaService)),
      doctorProfile: {
        findUnique: jest.fn().mockResolvedValue(mockDoctorProfile),
      },
      appointment: {
        findUnique: jest.fn().mockResolvedValue(mockAppointment),
        update: jest.fn().mockResolvedValue({
          ...mockAppointment,
          status: AppointmentStatus.COMPLETED,
        }),
      },
      prescription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockCreatedPrescription),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPrescription', () => {
    it('should validate IN_PROGRESS status, save atomically, and fire PrescriptionFinalizedEvent', async () => {
      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['High fever', 'Dry cough'],
        clinicalDiagnosis: ['Acute Viral Bronchitis'],
        vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
        advice: 'Rest and drink warm water',
        followUpDate: '2026-10-15T10:00:00.000Z',
        items: [
          {
            medicineName: 'Napa Extra',
            genericName: 'Paracetamol + Caffeine',
            dosageForm: 'Tablet',
            frequency: '1+0+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 7,
          },
        ],
      };

      const result = await service.createPrescription('user-doc-1', dto);

      // Verify Prisma atomic save
      expect(prismaService.prescription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          appointmentId: 'appt-123',
          doctorId: 'doc-profile-1',
          patientId: 'patient-profile-1',
          diagnosis: 'Acute Viral Bronchitis',
          chiefComplaints: 'High fever, Dry cough',
          vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
          advice: 'Rest and drink warm water',
        }),
        include: expect.any(Object),
      });

      // Verify appointment status updated to COMPLETED
      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-123' },
        data: { status: AppointmentStatus.COMPLETED },
      });

      // Verify event emission
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'prescription.finalized',
        expect.any(PrescriptionFinalizedEvent),
      );

      expect(result.id).toBe('rx-999');
    });

    it('should throw BadRequestException if appointment status is NOT IN_PROGRESS', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.CONFIRMED, // Not IN_PROGRESS
      });

      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['Fever'],
        clinicalDiagnosis: ['Flu'],
        items: [
          {
            medicineName: 'Napa',
            frequency: '1+1+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 5,
          },
        ],
      };

      await expect(service.createPrescription('user-doc-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(prismaService.prescription.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if caller is not the assigned doctor', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce({
        ...mockAppointment,
        doctorId: 'other-doc-profile',
      });

      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['Fever'],
        clinicalDiagnosis: ['Flu'],
        items: [
          {
            medicineName: 'Napa',
            frequency: '1+1+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 5,
          },
        ],
      };

      await expect(service.createPrescription('user-doc-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if doctor profile does not exist', async () => {
      prismaService.doctorProfile.findUnique.mockResolvedValueOnce(null);

      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['Fever'],
        clinicalDiagnosis: ['Flu'],
        items: [],
      };

      await expect(service.createPrescription('user-doc-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
