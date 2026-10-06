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
import { DrugSafetyService } from './drug-safety.service.js';
import { PrescriptionFinalizedEvent } from './events/prescription-finalized.event.js';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prismaService: any;
  let eventEmitter: any;
  let drugSafetyService: any;

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

  const mockSafeResult = {
    severity: 'SAFE',
    isBlocked: false,
    requiresOverride: false,
    conflicts: [],
  };

  const mockSevereResult = {
    severity: 'SEVERE',
    isBlocked: true,
    requiresOverride: true,
    conflicts: [
      {
        type: 'DRUG_DRUG_INTERACTION',
        medicationA: 'Warfarin',
        medicationB: 'Aspirin',
        severity: 'SEVERE',
        description: 'Major bleeding risk',
        recommendation: 'Avoid combination',
      },
    ],
  };

  beforeEach(async () => {
    eventEmitter = {
      emit: jest.fn(),
    };

    drugSafetyService = {
      verifySafety: jest.fn().mockResolvedValue(mockSafeResult),
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
        { provide: DrugSafetyService, useValue: drugSafetyService },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPrescription', () => {
    it('should validate IN_PROGRESS status, verify drug safety, save atomically & fire PrescriptionFinalizedEvent', async () => {
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

      expect(drugSafetyService.verifySafety).toHaveBeenCalledWith({
        appointmentId: 'appt-123',
        patientId: 'patient-profile-1',
        medicines: dto.items,
      });

      expect(prismaService.prescription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          appointmentId: 'appt-123',
          doctorId: 'doc-profile-1',
          patientId: 'patient-profile-1',
          diagnosis: 'Acute Viral Bronchitis',
        }),
        include: expect.any(Object),
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'prescription.finalized',
        expect.any(PrescriptionFinalizedEvent),
      );

      expect(result.id).toBe('rx-999');
    });

    it('should BLOCK prescription submission if SEVERE conflict is flagged without electronic override', async () => {
      drugSafetyService.verifySafety.mockResolvedValueOnce(mockSevereResult);

      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['Chest pain'],
        clinicalDiagnosis: ['Thrombosis'],
        items: [
          {
            medicineName: 'Warfarin',
            frequency: '1+0+0',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 14,
          },
          {
            medicineName: 'Aspirin',
            frequency: '0+0+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 14,
          },
        ],
      };

      await expect(service.createPrescription('user-doc-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(prismaService.prescription.create).not.toHaveBeenCalled();
    });

    it('should ALLOW prescription submission if SEVERE conflict has a valid electronic override with clinical justification', async () => {
      drugSafetyService.verifySafety.mockResolvedValueOnce(mockSevereResult);

      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['Chest pain'],
        clinicalDiagnosis: ['Thrombosis'],
        items: [
          {
            medicineName: 'Warfarin',
            frequency: '1+0+0',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 14,
          },
          {
            medicineName: 'Aspirin',
            frequency: '0+0+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 14,
          },
        ],
        overrideAcknowledgement: {
          isAcknowledged: true,
          clinicalJustification:
            'Co-prescription clinically required due to acute cardiac stent prophylaxis; patient monitored daily with INR checks.',
        },
      };

      const result = await service.createPrescription('user-doc-1', dto);

      expect(prismaService.prescription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          overrideReason:
            'Co-prescription clinically required due to acute cardiac stent prophylaxis; patient monitored daily with INR checks.',
          overrideJson: mockSevereResult,
        }),
        include: expect.any(Object),
      });

      expect(result.id).toBe('rx-999');
    });
  });
});
