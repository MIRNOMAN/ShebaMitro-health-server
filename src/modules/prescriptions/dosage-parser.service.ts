import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RemindersQueueService } from './reminders-queue.service.js';

export interface ParseAndScheduleInput {
  patientId: string;
  prescriptionItemId: string;
  schedulePattern: string; // e.g. "1+0+1", "1+1+1", "1+0+0", "0+0+1"
  durationDays: number; // e.g. 7
  timezone?: string; // e.g. "Asia/Dhaka" (+06:00) or UTC offset
  startDate?: Date;
}

export interface DosageSlot {
  hours: number;
  minutes: number;
  label: string;
}

@Injectable()
export class DosageParserService {
  private readonly logger = new Logger(DosageParserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly remindersQueueService: RemindersQueueService,
  ) {}

  /**
   * Parse pattern (e.g. "1+0+1") into dosage time slots (e.g. 08:30 AM and 09:00 PM)
   */
  parseSchedulePattern(pattern: string): DosageSlot[] {
    const cleaned = pattern.replace(/\s+/g, '').trim();
    const slots: DosageSlot[] = [];

    // Pattern like "1+0+1" or "1+1+1" or "1-0-1"
    const parts = cleaned.split(/[\+\-,\/]/);

    if (parts.length === 3) {
      // Morning (1+0+0), Afternoon (0+1+0), Evening/Night (0+0+1)
      if (parseInt(parts[0], 10) > 0) {
        slots.push({ hours: 8, minutes: 30, label: 'Morning (08:30 AM)' });
      }
      if (parseInt(parts[1], 10) > 0) {
        slots.push({ hours: 13, minutes: 30, label: 'Afternoon (01:30 PM)' });
      }
      if (parseInt(parts[2], 10) > 0) {
        slots.push({ hours: 21, minutes: 0, label: 'Night (09:00 PM)' });
      }
    } else if (parts.length === 4) {
      // 4 times a day: 08:00 AM, 12:00 PM, 05:00 PM, 09:00 PM
      if (parseInt(parts[0], 10) > 0) slots.push({ hours: 8, minutes: 0, label: 'Morning (08:00 AM)' });
      if (parseInt(parts[1], 10) > 0) slots.push({ hours: 12, minutes: 0, label: 'Noon (12:00 PM)' });
      if (parseInt(parts[2], 10) > 0) slots.push({ hours: 17, minutes: 0, label: 'Evening (05:00 PM)' });
      if (parseInt(parts[3], 10) > 0) slots.push({ hours: 21, minutes: 0, label: 'Night (09:00 PM)' });
    } else if (parts.length === 2) {
      // 2 times a day: 08:30 AM, 08:30 PM
      if (parseInt(parts[0], 10) > 0) slots.push({ hours: 8, minutes: 30, label: 'Morning (08:30 AM)' });
      if (parseInt(parts[1], 10) > 0) slots.push({ hours: 20, minutes: 30, label: 'Night (08:30 PM)' });
    } else {
      // Fallback default: Morning 08:30 AM & Night 09:00 PM
      slots.push({ hours: 8, minutes: 30, label: 'Morning (08:30 AM)' });
      slots.push({ hours: 21, minutes: 0, label: 'Night (09:00 PM)' });
    }

    return slots;
  }

  /**
   * Calculate exact scheduled timestamps adjusted for patient timezone offset
   */
  calculateScheduledTimestamps(
    pattern: string,
    durationDays: number,
    timezoneOffsetMinutes: number = -360, // Default Asia/Dhaka (+06:00 = -360 UTC offset)
    startDate: Date = new Date(),
  ): Date[] {
    const slots = this.parseSchedulePattern(pattern);
    const timestamps: Date[] = [];

    const baseYear = startDate.getUTCFullYear();
    const baseMonth = startDate.getUTCMonth();
    const baseDay = startDate.getUTCDate();

    for (let dayIndex = 0; dayIndex < durationDays; dayIndex++) {
      for (const slot of slots) {
        // Compute timestamp in patient timezone (adjusting for UTC offset)
        const scheduledDate = new Date(Date.UTC(baseYear, baseMonth, baseDay + dayIndex, slot.hours, slot.minutes, 0, 0));

        // Adjust for timezone offset (e.g. +6 hours = -360 mins from UTC)
        scheduledDate.setMinutes(scheduledDate.getMinutes() + timezoneOffsetMinutes);

        timestamps.push(scheduledDate);
      }
    }

    return timestamps;
  }

  /**
   * Parse pattern, bulk insert MedicineReminder records into DB, and schedule delayed BullMQ jobs
   */
  async parseAndScheduleItemReminders(input: ParseAndScheduleInput) {
    const { patientId, prescriptionItemId, schedulePattern, durationDays, startDate } = input;

    // 1. Calculate exact dosage timestamps across treatment duration
    const timestamps = this.calculateScheduledTimestamps(
      schedulePattern,
      durationDays,
      -360, // Asia/Dhaka (+06:00) timezone offset
      startDate || new Date(),
    );

    this.logger.log(
      `Parsed pattern "${schedulePattern}" for ${durationDays} days: generated ${timestamps.length} dosage timestamps`,
    );

    // 2. Bulk insert MedicineReminder records into DB
    const reminderRecords = timestamps.map((intakeTime) => ({
      patientId,
      prescriptionItemId,
      intakeTime,
      status: ReminderStatus.PENDING,
    }));

    await this.prisma.medicineReminder.createMany({
      data: reminderRecords,
    });

    // 3. Fetch newly created reminders from DB to obtain generated IDs
    const createdReminders = await this.prisma.medicineReminder.findMany({
      where: {
        prescriptionItemId,
        patientId,
        status: ReminderStatus.PENDING,
      },
      orderBy: { intakeTime: 'asc' },
    });

    // 4. Schedule corresponding delayed BullMQ jobs with unique job IDs
    for (const reminder of createdReminders) {
      await this.remindersQueueService.addReminderJob({
        reminderId: reminder.id,
        patientId: reminder.patientId,
        prescriptionItemId: reminder.prescriptionItemId,
        intakeTime: reminder.intakeTime,
      });
    }

    this.logger.log(
      `Successfully created ${createdReminders.length} MedicineReminder DB records and scheduled BullMQ delayed jobs for prescription item ${prescriptionItemId}`,
    );

    return createdReminders;
  }

  /**
   * Record TAKEN or SKIPPED status for a medicine reminder and compute patient compliance rate
   */
  async acknowledgeReminder(
    userId: string,
    reminderId: string,
    status: ReminderStatus,
  ) {
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      throw new NotFoundException(`Patient profile not found for user ID ${userId}`);
    }

    const reminder = await this.prisma.medicineReminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      throw new NotFoundException(`Medicine reminder with ID ${reminderId} not found`);
    }

    if (reminder.patientId !== patientProfile.id) {
      throw new ForbiddenException(
        'Access denied. You do not have permission to acknowledge this reminder.',
      );
    }

    const updatedReminder = await this.prisma.medicineReminder.update({
      where: { id: reminderId },
      data: {
        status,
        acknowledgedAt: new Date(),
      },
    });

    // Compute patient compliance rate across all reminders
    const allReminders = await this.prisma.medicineReminder.findMany({
      where: { patientId: patientProfile.id },
    });

    const totalReminders = allReminders.length;
    const takenCount = allReminders.filter((r) => r.status === ReminderStatus.TAKEN).length;
    const skippedCount = allReminders.filter((r) => r.status === ReminderStatus.SKIPPED).length;
    const pendingCount = allReminders.filter((r) => r.status === ReminderStatus.PENDING).length;

    const complianceRate =
      totalReminders > 0 ? Number(((takenCount / totalReminders) * 100).toFixed(1)) : 0;

    this.logger.log(
      `Patient ${patientProfile.id} acknowledged reminder ${reminderId} as ${status}. Updated compliance rate: ${complianceRate}%`,
    );

    return {
      reminder: updatedReminder,
      complianceRate,
      complianceSummary: {
        totalReminders,
        takenCount,
        skippedCount,
        pendingCount,
        complianceRatePercentage: complianceRate,
      },
    };
  }
}

