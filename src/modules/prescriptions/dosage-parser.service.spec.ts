import { Test, TestingModule } from '@nestjs/testing';
import { ReminderStatus } from '@prisma/client';
import { DosageParserService } from './dosage-parser.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RemindersQueueService } from './reminders-queue.service.js';

describe('DosageParserService', () => {
  let service: DosageParserService;
  let prismaService: any;
  let remindersQueueService: any;

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
      },
    };

    remindersQueueService = {
      addReminderJob: jest.fn().mockResolvedValue({ id: 'reminder-reminder-db-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DosageParserService,
        { provide: PrismaService, useValue: prismaService },
        { provide: RemindersQueueService, useValue: remindersQueueService },
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
      expect(slots[0]).toEqual({ hours: 8, minutes: 30, label: 'Morning (08:30 AM)' });
      expect(slots[1]).toEqual({ hours: 21, minutes: 0, label: 'Night (09:00 PM)' });
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
      const timestamps = service.calculateScheduledTimestamps('1+0+1', 7, -360, startDate);
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

      // Verify DB bulk insert createMany was called
      expect(prismaService.medicineReminder.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            patientId: 'patient-123',
            prescriptionItemId: 'item-456',
            status: ReminderStatus.PENDING,
          }),
        ]),
      });

      // Verify newly created reminders were queried from DB
      expect(prismaService.medicineReminder.findMany).toHaveBeenCalledWith({
        where: {
          prescriptionItemId: 'item-456',
          patientId: 'patient-123',
          status: ReminderStatus.PENDING,
        },
        orderBy: { intakeTime: 'asc' },
      });

      // Verify BullMQ jobs were scheduled for each created reminder
      expect(remindersQueueService.addReminderJob).toHaveBeenCalledTimes(2);
      expect(remindersQueueService.addReminderJob).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderId: 'reminder-db-1',
          patientId: 'patient-123',
          prescriptionItemId: 'item-456',
        }),
      );

      expect(result.length).toBe(2);
    });
  });

  describe('acknowledgeReminder', () => {
    it('should update status to TAKEN and compute patient compliance rate', async () => {
      prismaService.patientProfile = {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-123', userId: 'user-pat-1' }),
      };
      prismaService.medicineReminder.findUnique = jest.fn().mockResolvedValue({
        id: 'rem-123',
        patientId: 'patient-123',
        status: ReminderStatus.PENDING,
      });
      prismaService.medicineReminder.update = jest.fn().mockResolvedValue({
        id: 'rem-123',
        patientId: 'patient-123',
        status: ReminderStatus.TAKEN,
        acknowledgedAt: new Date(),
      });
      prismaService.medicineReminder.findMany = jest.fn().mockResolvedValue([
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

      // 2 taken out of 4 total = 50%
      expect(result.complianceRate).toBe(50);
      expect(result.complianceSummary.takenCount).toBe(2);
      expect(result.complianceSummary.skippedCount).toBe(1);
    });
  });
});

