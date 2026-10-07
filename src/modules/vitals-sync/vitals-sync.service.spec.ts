import { Test, TestingModule } from '@nestjs/testing';
import { Role, VitalType } from '@prisma/client';
import { VitalsSyncService } from './vitals-sync.service.js';
import { VitalsSyncGateway } from './vitals-sync.gateway.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('VitalsSyncService', () => {
  let service: VitalsSyncService;
  let prisma: any;
  let gateway: any;

  const mockPatientProfile = {
    id: 'patient-profile-100',
    userId: 'user-patient-100',
    user: { name: 'John Doe', email: 'john@example.com', phone: '+123456789' },
  };

  const mockCardiologist = {
    id: 'doctor-cardio-200',
    userId: 'user-doctor-200',
    name: 'Dr. Smith',
    specialization: 'Cardiology',
    isApproved: true,
  };

  beforeEach(async () => {
    prisma = {
      patientProfile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'patient-profile-100' || where.userId === 'user-patient-100') {
            return Promise.resolve(mockPatientProfile);
          }
          return Promise.resolve(null);
        }),
      },
      biometricVital: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `vital-${Math.random().toString(36).substring(7)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue({ doctor: mockCardiologist }),
      },
      prescription: {
        findFirst: jest.fn().mockResolvedValue({ doctor: mockCardiologist }),
      },
      doctorProfile: {
        findFirst: jest.fn().mockResolvedValue(mockCardiologist),
      },
      vitalAlert: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `alert-${Math.random().toString(36).substring(7)}`,
            ...data,
            createdAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    gateway = {
      emitEmergencyAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VitalsSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: VitalsSyncGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<VitalsSyncService>(VitalsSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncVitals', () => {
    it('should bulk ingest normal vitals without triggering emergency alerts', async () => {
      const dto = {
        vitals: [
          {
            patientId: 'patient-profile-100',
            type: VitalType.SPO2,
            value: 98,
            unit: '%',
            recordedAt: '2026-10-07T10:00:00.000Z',
          },
          {
            patientId: 'patient-profile-100',
            type: VitalType.BP,
            value: 120,
            unit: 'mmHg',
            recordedAt: '2026-10-07T10:00:00.000Z',
          },
        ],
      };

      const result = await service.syncVitals('user-patient-100', Role.PATIENT, dto);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.alertsTriggeredCount).toBe(0);
      expect(prisma.biometricVital.create).toHaveBeenCalledTimes(2);
      expect(prisma.vitalAlert.create).not.toHaveBeenCalled();
      expect(gateway.emitEmergencyAlert).not.toHaveBeenCalled();
    });

    it('should trigger an emergency alert when SpO2 < 92%', async () => {
      const dto = {
        vitals: [
          {
            patientId: 'patient-profile-100',
            type: VitalType.SPO2,
            value: 89,
            unit: '%',
            recordedAt: '2026-10-07T10:00:00.000Z',
          },
        ],
      };

      const result = await service.syncVitals('user-patient-100', Role.PATIENT, dto);

      expect(result.success).toBe(true);
      expect(result.alertsTriggeredCount).toBe(1);
      expect(prisma.vitalAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 'patient-profile-100',
          doctorId: 'doctor-cardio-200',
          vitalType: VitalType.SPO2,
          value: 89,
          threshold: 'SpO2 < 92%',
          severity: 'EMERGENCY',
        }),
      });
      expect(gateway.emitEmergencyAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: 'patient-profile-100',
          doctorId: 'doctor-cardio-200',
          vitalType: VitalType.SPO2,
          value: 89,
          threshold: 'SpO2 < 92%',
        }),
      );
    });

    it('should trigger an emergency alert when Systolic BP > 160', async () => {
      const dto = {
        vitals: [
          {
            patientId: 'patient-profile-100',
            type: VitalType.BP,
            value: 170,
            unit: 'mmHg',
            recordedAt: '2026-10-07T10:00:00.000Z',
          },
        ],
      };

      const result = await service.syncVitals('user-patient-100', Role.PATIENT, dto);

      expect(result.success).toBe(true);
      expect(result.alertsTriggeredCount).toBe(1);
      expect(prisma.vitalAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 'patient-profile-100',
          doctorId: 'doctor-cardio-200',
          vitalType: VitalType.BP,
          value: 170,
          threshold: 'Systolic BP > 160',
          severity: 'EMERGENCY',
        }),
      });
      expect(gateway.emitEmergencyAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: 'patient-profile-100',
          doctorId: 'doctor-cardio-200',
          vitalType: VitalType.BP,
          value: 170,
          threshold: 'Systolic BP > 160',
        }),
      );
    });

    it('should respect idempotency key and skip duplicate vital insertion', async () => {
      const mockExisting = {
        id: 'vital-existing-99',
        patientId: 'patient-profile-100',
        type: VitalType.HEART_RATE,
        value: 75,
        unit: 'bpm',
        idempotencyKey: 'idempotent-key-123',
      };
      prisma.biometricVital.findUnique.mockResolvedValueOnce(mockExisting);

      const dto = {
        idempotencyKey: 'idempotent-key-123',
        vitals: [
          {
            patientId: 'patient-profile-100',
            type: VitalType.HEART_RATE,
            value: 75,
            unit: 'bpm',
            recordedAt: '2026-10-07T10:00:00.000Z',
            idempotencyKey: 'idempotent-key-123',
          },
        ],
      };

      const result = await service.syncVitals('user-patient-100', Role.PATIENT, dto);

      expect(result.skippedDuplicateCount).toBe(1);
      expect(result.syncedCount).toBe(0);
      expect(prisma.biometricVital.create).not.toHaveBeenCalled();
    });
  });
});
