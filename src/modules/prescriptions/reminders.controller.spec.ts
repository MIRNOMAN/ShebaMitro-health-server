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

  const mockSnoozeResponse = {
    reminder: {
      id: 'rem-123',
      patientId: 'patient-456',
      intakeTime: new Date(Date.now() + 15 * 60 * 1000),
      status: ReminderStatus.PENDING,
    },
    snoozedByMinutes: 15,
    message: 'Alarm snoozed successfully by 15 minutes.',
  };

  const mockComplianceResponse = {
    patientId: 'patient-456',
    patientName: 'Abdul',
    adherencePercentage: 65,
    dosesTakenOnTime: 13,
    totalPrescribedDoses: 20,
    skippedDoses: 5,
    pendingDoses: 2,
    adherenceAlertTriggered: true,
    alertThreshold: 70,
    pushNotificationSent: true,
    flaggedUpcomingAppointmentsCount: 1,
  };

  beforeEach(async () => {
    dosageParserService = {
      acknowledgeReminder: jest.fn().mockResolvedValue(mockAckResponse),
      snoozeReminder: jest.fn().mockResolvedValue(mockSnoozeResponse),
      getPatientCompliance: jest.fn().mockResolvedValue(mockComplianceResponse),
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
  });

  describe('snoozeReminder', () => {
    it('should delay alarm by 15 mins by default', async () => {
      const result = await controller.snoozeReminder(
        'user-patient-1',
        'rem-123',
        {},
      );

      expect(dosageParserService.snoozeReminder).toHaveBeenCalledWith(
        'user-patient-1',
        'rem-123',
        15,
      );
      expect(result.snoozedByMinutes).toBe(15);
    });

    it('should delay alarm by 30 mins when specified', async () => {
      dosageParserService.snoozeReminder.mockResolvedValueOnce({
        ...mockSnoozeResponse,
        snoozedByMinutes: 30,
      });

      const result = await controller.snoozeReminder(
        'user-patient-1',
        'rem-123',
        { minutes: 30 },
      );

      expect(dosageParserService.snoozeReminder).toHaveBeenCalledWith(
        'user-patient-1',
        'rem-123',
        30,
      );
      expect(result.snoozedByMinutes).toBe(30);
    });
  });

  describe('getPatientCompliance', () => {
    it('should calculate adherence percentage and return report', async () => {
      const result = await controller.getPatientCompliance('patient-456');

      expect(dosageParserService.getPatientCompliance).toHaveBeenCalledWith(
        'patient-456',
      );
      expect(result.adherencePercentage).toBe(65);
      expect(result.adherenceAlertTriggered).toBe(true);
    });
  });
});
