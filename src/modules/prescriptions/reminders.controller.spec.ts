import { Test, TestingModule } from '@nestjs/testing';
import { ReminderStatus } from '@prisma/client';
import { RemindersController } from './reminders.controller.js';
import { DosageParserService } from './dosage-parser.service.js';

describe('RemindersController', () => {
  let controller: RemindersController;
  let dosageParserService: any;

  const mockAckResponse = {
    reminder: {
      id: 'rem-123',
      patientId: 'patient-456',
      prescriptionItemId: 'item-789',
      intakeTime: new Date(),
      status: ReminderStatus.TAKEN,
      acknowledgedAt: new Date(),
    },
    complianceRate: 100,
    complianceSummary: {
      totalReminders: 1,
      takenCount: 1,
      skippedCount: 0,
      pendingCount: 0,
      complianceRatePercentage: 100,
    },
  };

  beforeEach(async () => {
    dosageParserService = {
      acknowledgeReminder: jest.fn().mockResolvedValue(mockAckResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [
        { provide: DosageParserService, useValue: dosageParserService },
      ],
    }).compile();

    controller = module.get<RemindersController>(RemindersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('acknowledgeReminder', () => {
    it('should record TAKEN status and compute compliance rate', async () => {
      const result = await controller.acknowledgeReminder(
        'user-patient-1',
        'rem-123',
        { status: ReminderStatus.TAKEN },
      );

      expect(dosageParserService.acknowledgeReminder).toHaveBeenCalledWith(
        'user-patient-1',
        'rem-123',
        ReminderStatus.TAKEN,
      );

      expect(result.reminder.status).toBe(ReminderStatus.TAKEN);
      expect(result.complianceRate).toBe(100);
    });

    it('should record SKIPPED status when requested', async () => {
      dosageParserService.acknowledgeReminder.mockResolvedValueOnce({
        ...mockAckResponse,
        reminder: {
          ...mockAckResponse.reminder,
          status: ReminderStatus.SKIPPED,
        },
        complianceRate: 50,
      });

      const result = await controller.acknowledgeReminder(
        'user-patient-1',
        'rem-123',
        { status: ReminderStatus.SKIPPED },
      );

      expect(dosageParserService.acknowledgeReminder).toHaveBeenCalledWith(
        'user-patient-1',
        'rem-123',
        ReminderStatus.SKIPPED,
      );

      expect(result.reminder.status).toBe(ReminderStatus.SKIPPED);
    });
  });
});
