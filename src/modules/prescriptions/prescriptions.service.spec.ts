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
import { S3Service } from '../../common/storage/s3.service.js';
import { DrugSafetyService } from './drug-safety.service.js';
import { PdfRendererService } from './pdf-renderer.service.js';
import { DosageParserService } from './dosage-parser.service.js';
import { PrescriptionFinalizedEvent } from './events/prescription-finalized.event.js';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prismaService: any;
  let eventEmitter: any;
  let drugSafetyService: any;
  let pdfRendererService: any;
  let s3Service: any;

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

    pdfRendererService = {
      renderPrescriptionPdf: jest.fn().mockResolvedValue({
        pdfBuffer: Buffer.from('mock-pdf'),
        sha256Hash: 'mock-sha256-hash-1234567890abcdef',
        verifyUrl:
          'https://shebamitro.health/verify-rx/rx-999?hash=mock-sha256-hash-1234567890abcdef',
      }),
    };

    s3Service = {
      uploadBuffer: jest.fn().mockResolvedValue({
        key: 'prescriptions/pdf/rx-999.pdf',
        fileUrl: 'https://s3.amazonaws.com/presigned-pdf-url',
        presignedUrl: 'https://s3.amazonaws.com/presigned-pdf-url',
      }),
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
        update: jest.fn().mockResolvedValue({
          ...mockCreatedPrescription,
          qrCodeHash: 'mock-sha256-hash-1234567890abcdef',
          pdfUrl: 'https://s3.amazonaws.com/presigned-pdf-url',
        }),
      },
    };

    const dosageParserService = {
      parseAndScheduleItemReminders: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: DrugSafetyService, useValue: drugSafetyService },
        { provide: PdfRendererService, useValue: pdfRendererService },
        { provide: S3Service, useValue: s3Service },
        { provide: DosageParserService, useValue: dosageParserService },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPrescription', () => {
    it('should validate IN_PROGRESS status, verify safety, render PDF with QR hash, upload to S3, & fire event', async () => {
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

      expect(pdfRendererService.renderPrescriptionPdf).toHaveBeenCalled();
      expect(s3Service.uploadBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'prescriptions/pdf/rx-999.pdf',
        'application/pdf',
      );
      expect(prismaService.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-999' },
        data: {
          qrCodeHash: 'mock-sha256-hash-1234567890abcdef',
          pdfUrl: 'https://s3.amazonaws.com/presigned-pdf-url',
        },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'prescription.finalized',
        expect.any(PrescriptionFinalizedEvent),
      );

      expect(result.id).toBe('rx-999');
      expect(result.qrCodeHash).toBe('mock-sha256-hash-1234567890abcdef');
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

      await expect(
        service.createPrescription('user-doc-1', dto),
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.prescription.create).not.toHaveBeenCalled();
    });
  });
});
