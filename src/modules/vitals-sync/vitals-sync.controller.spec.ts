import { Test, TestingModule } from '@nestjs/testing';
import { Role, VitalType } from '@prisma/client';
import { VitalsSyncController } from './vitals-sync.controller.js';
import { VitalsSyncService } from './vitals-sync.service.js';

describe('VitalsSyncController', () => {
  let controller: VitalsSyncController;
  let service: any;

  const mockSyncResult = {
    success: true,
    syncedCount: 2,
    skippedDuplicateCount: 0,
    totalProcessed: 2,
    alertsTriggeredCount: 0,
    vitals: [
      { id: 'vital-1', type: VitalType.SPO2, value: 97, unit: '%' },
      { id: 'vital-2', type: VitalType.HEART_RATE, value: 72, unit: 'bpm' },
    ],
    alerts: [],
  };

  beforeEach(async () => {
    service = {
      syncVitals: jest.fn().mockResolvedValue(mockSyncResult),
      getPatientVitals: jest.fn().mockResolvedValue(mockSyncResult.vitals),
      getAlerts: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VitalsSyncController],
      providers: [{ provide: VitalsSyncService, useValue: service }],
    }).compile();

    controller = module.get<VitalsSyncController>(VitalsSyncController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncVitals', () => {
    it('should handle SyncVitalsDto payload', async () => {
      const dto = {
        idempotencyKey: 'batch-001',
        vitals: [
          {
            type: VitalType.SPO2,
            value: 97,
            unit: '%',
            recordedAt: '2026-10-07T10:00:00.000Z',
          },
        ],
      };

      const result = await controller.syncVitals(
        'user-123',
        Role.PATIENT,
        dto,
        'batch-header-key',
      );

      expect(service.syncVitals).toHaveBeenCalledWith(
        'user-123',
        Role.PATIENT,
        dto,
        'batch-header-key',
      );
      expect(result).toBe(mockSyncResult);
    });

    it('should normalize array payload into SyncVitalsDto', async () => {
      const arrayBody = [
        {
          type: VitalType.SPO2,
          value: 97,
          unit: '%',
          recordedAt: '2026-10-07T10:00:00.000Z',
        },
      ];

      await controller.syncVitals(
        'user-123',
        Role.PATIENT,
        arrayBody,
        undefined,
      );

      expect(service.syncVitals).toHaveBeenCalledWith(
        'user-123',
        Role.PATIENT,
        { vitals: arrayBody },
        undefined,
      );
    });
  });

  describe('getPatientVitals', () => {
    it('should call service.getPatientVitals with patientId and limit', async () => {
      const result = await controller.getPatientVitals('patient-123', 10);
      expect(service.getPatientVitals).toHaveBeenCalledWith('patient-123', 10);
      expect(result).toEqual(mockSyncResult.vitals);
    });
  });

  describe('getAlerts', () => {
    it('should call service.getAlerts with filter query params', async () => {
      const result = await controller.getAlerts('patient-123', 'doc-456');
      expect(service.getAlerts).toHaveBeenCalledWith({
        patientId: 'patient-123',
        doctorId: 'doc-456',
      });
      expect(result).toEqual([]);
    });
  });
});
