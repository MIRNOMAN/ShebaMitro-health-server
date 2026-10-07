import { Test, TestingModule } from '@nestjs/testing';
import { ReminderStatus } from '@prisma/client';
import { DosageParserService } from './dosage-parser.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RemindersQueueService } from './reminders-queue.service.js';
import { WebPushService } from './web-push.service.js';

describe('DosageParserService', () => {
  let service: DosageParserService;
  let prismaService: any;
  let remindersQueueService: any;
  let webPushService: any;

  beforeEach(async () => {
    prismaService = {
      medicineReminder: {
        createMany: jest.fn().mockResolvedValue({ count: 14 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'reminder-db-1',
            patientId: 'patient-123',
            prescriptionItemId: 'item-456',
            intakeTime: new Date('2026-10-07T02:30:00.000Z'),
            status: ReminderStatus.PENDING,
          },
          {
            id: 'reminder-db-2',
            patientId: 'patient-123',
            prescriptionItemId: 'item-456',
            intakeTime: new Date('2026-10-07T15:00:00.000Z'),
            status: ReminderStatus.PENDING,
          },
        ]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      patientProfile: {
        findUnique: jest.fn(),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    remindersQueueService = {
      addReminderJob: jest
        .fn()
        .mockResolvedValue({ id: 'reminder-reminder-db-1' }),
      snoozeReminderJob: jest
        .fn()
        .mockResolvedValue({ id: 'reminder-reminder-db-1' }),
    };

    webPushService = {
      sendAlarmNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DosageParserService,
        { provide: PrismaService, useValue: prismaService },
        { provide: RemindersQueueService, useValue: remindersQueueService },
        { provide: WebPushService, useValue: webPushService },
      ],
    }).compile();

    service = module.get<DosageParserService>(DosageParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseSchedulePattern', () => {
    it('should parse "1+0+1" into Morning (08:30 AM) and Night (09:00 PM)', () => {
      const slots = service.parseSchedulePattern('1+0+1');
      expect(slots.length).toBe(2);
      expect(slots[0]).toEqual({
        hours: 8,
        minutes: 30,
        label: 'Morning (08:30 AM)',
      });
      expect(slots[1]).toEqual({
        hours: 21,
        minutes: 0,
        label: 'Night (09:00 PM)',
      });
    });

    it('should parse "1+1+1" into Morning, Afternoon, and Night slots', () => {
      const slots = service.parseSchedulePattern('1+1+1');
      expect(slots.length).toBe(3);
      expect(slots[0].label).toContain('Morning');
      expect(slots[1].label).toContain('Afternoon');
      expect(slots[2].label).toContain('Night');
    });

    it('should parse 4-slot pattern "1+1+1+1" correctly', () => {
      const slots = service.parseSchedulePattern('1+1+1+1');
      expect(slots.length).toBe(4);
      expect(slots[0].hours).toBe(8);
      expect(slots[1].hours).toBe(12);
      expect(slots[2].hours).toBe(17);
      expect(slots[3].hours).toBe(21);
    });

    it('should parse 2-slot pattern "1+1" correctly', () => {
      const slots = service.parseSchedulePattern('1+1');
      expect(slots.length).toBe(2);
      expect(slots[0].hours).toBe(8);
      expect(slots[1].hours).toBe(20);
    });
  });

  describe('calculateScheduledTimestamps', () => {
    it('should generate correct number of timestamps across durationDays adjusted for timezone offset', () => {
      const startDate = new Date('2026-10-07T00:00:00.000Z');
      // "1+0+1" for 7 days = 14 dosage timestamps
      const timestamps = service.calculateScheduledTimestamps(
        '1+0+1',
        7,
        -360,
        startDate,
      );
      expect(timestamps.length).toBe(14);
      expect(timestamps[0] instanceof Date).toBe(true);
    });
  });

  describe('parseAndScheduleItemReminders', () => {
    it('should bulk insert MedicineReminder DB records and schedule delayed BullMQ jobs', async () => {
      const input = {
        patientId: 'patient-123',
        prescriptionItemId: 'item-456',
        schedulePattern: '1+0+1',
        durationDays: 7,
        startDate: new Date('2026-10-07T00:00:00.000Z'),
      };

      const result = await service.parseAndScheduleItemReminders(input);

      expect(prismaService.medicineReminder.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            patientId: 'patient-123',
            prescriptionItemId: 'item-456',
            status: ReminderStatus.PENDING,
          }),
        ]),
      });

      expect(remindersQueueService.addReminderJob).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(2);
    });
  });

  describe('acknowledgeReminder', () => {
    it('should update status to TAKEN and compute patient compliance rate', async () => {
      prismaService.patientProfile.findUnique.mockResolvedValueOnce({
        id: 'patient-123',
        userId: 'user-pat-1',
      });
      prismaService.medicineReminder.findUnique.mockResolvedValueOnce({
        id: 'rem-123',
        patientId: 'patient-123',
        status: ReminderStatus.PENDING,
      });
      prismaService.medicineReminder.update.mockResolvedValueOnce({
        id: 'rem-123',
        patientId: 'patient-123',
        status: ReminderStatus.TAKEN,
        acknowledgedAt: new Date(),
      });
      prismaService.medicineReminder.findMany.mockResolvedValueOnce([
        { id: 'rem-123', status: ReminderStatus.TAKEN },
        { id: 'rem-124', status: ReminderStatus.TAKEN },
        { id: 'rem-125', status: ReminderStatus.SKIPPED },
        { id: 'rem-126', status: ReminderStatus.PENDING },
      ]);

      const result = await service.acknowledgeReminder(
        'user-pat-1',
        'rem-123',
        ReminderStatus.TAKEN,
      );

      expect(prismaService.medicineReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-123' },
        data: {
          status: ReminderStatus.TAKEN,
          acknowledgedAt: expect.any(Date),
        },
      });

      expect(result.complianceRate).toBe(50);
      expect(result.complianceSummary.takenCount).toBe(2);
    });
  });

  describe('snoozeReminder', () => {
    it('should delay reminder alarm in DB and BullMQ by specified minutes', async () => {
      prismaService.patientProfile.findUnique.mockResolvedValueOnce({
        id: 'patient-123',
        userId: 'user-pat-1',
      });
      prismaService.medicineReminder.findUnique.mockResolvedValueOnce({
        id: 'rem-123',
        patientId: 'patient-123',
        prescriptionItemId: 'item-456',
        intakeTime: new Date(),
        status: ReminderStatus.PENDING,
      });
      prismaService.medicineReminder.update.mockImplementationOnce(
        ({ data }: any) => ({
          id: 'rem-123',
          patientId: 'patient-123',
          intakeTime: data.intakeTime,
          status: ReminderStatus.PENDING,
        }),
      );

      const result = await service.snoozeReminder('user-pat-1', 'rem-123', 30);

      expect(remindersQueueService.snoozeReminderJob).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderId: 'rem-123',
          patientId: 'patient-123',
        }),
        30,
      );
      expect(result.snoozedByMinutes).toBe(30);
    });
  });

  describe('getPatientCompliance', () => {
    it('should calculate adherence percentage and trigger push reminder & flag doctor appointment when adherence < 70%', async () => {
      prismaService.patientProfile.findUnique.mockResolvedValueOnce({
        id: 'patient-123',
        user: { name: 'Abdul' },
      });
      // 5 taken out of 10 total = 50% adherence (<70%)
      prismaService.medicineReminder.findMany.mockResolvedValueOnce([
        { id: '1', status: ReminderStatus.TAKEN },
        { id: '2', status: ReminderStatus.TAKEN },
        { id: '3', status: ReminderStatus.TAKEN },
        { id: '4', status: ReminderStatus.TAKEN },
        { id: '5', status: ReminderStatus.TAKEN },
        { id: '6', status: ReminderStatus.SKIPPED },
        { id: '7', status: ReminderStatus.SKIPPED },
        { id: '8', status: ReminderStatus.SKIPPED },
        { id: '9', status: ReminderStatus.PENDING },
        { id: '10', status: ReminderStatus.PENDING },
      ]);
      prismaService.appointment.findMany.mockResolvedValueOnce([
        { id: 'appt-99', notes: 'Routine follow-up' },
      ]);

      const result = await service.getPatientCompliance('patient-123');

      expect(result.adherencePercentage).toBe(50);
      expect(result.adherenceAlertTriggered).toBe(true);

      // Verify automated push notification was sent to patient
      expect(webPushService.sendAlarmNotification).toHaveBeenCalledWith(
        'patient-123',
        expect.objectContaining({
          medicineName: 'Low Medication Adherence Warning',
        }),
      );

      // Verify doctor upcoming follow-up appointment view was flagged
      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-99' },
        data: {
          notes: expect.stringContaining('ADHERENCE ALERT'),
        },
      });

      expect(result.flaggedUpcomingAppointmentsCount).toBe(1);
    });
  });
});
