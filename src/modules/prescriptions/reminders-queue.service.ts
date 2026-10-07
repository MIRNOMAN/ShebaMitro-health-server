import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { WebPushService } from './web-push.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { AudioReminderService } from './audio-reminder.service.js';

export interface ReminderJobPayload {
  reminderId: string;
  patientId: string;
  prescriptionItemId: string;
  intakeTime: Date;
}

export const MEDICINE_REMINDERS_QUEUE = 'medicine-reminders';

@Injectable()
export class RemindersQueueService {
  private readonly logger = new Logger(RemindersQueueService.name);

  constructor(
    @InjectQueue(MEDICINE_REMINDERS_QUEUE) private readonly remindersQueue: Queue,
  ) {}

  /**
   * Schedule a delayed BullMQ job with a unique job ID for an individual dosage time
   */
  async addReminderJob(payload: ReminderJobPayload): Promise<Job> {
    const intakeTimestamp = new Date(payload.intakeTime).getTime();
    const delay = Math.max(0, intakeTimestamp - Date.now());
    const jobId = `reminder-${payload.reminderId}`;

    const job = await this.remindersQueue.add(
      'send-reminder',
      payload,
      {
        jobId,
        delay,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );

    this.logger.log(
      `Scheduled delayed BullMQ job ${jobId} for reminder ${payload.reminderId} with delay of ${delay}ms`,
    );

    return job;
  }

  /**
   * Schedule a 15-minute fallback job to check if reminder is still unacknowledged
   */
  async addFallbackCheckJob(
    payload: ReminderJobPayload,
    delayMs: number = 15 * 60 * 1000,
  ): Promise<Job> {
    const jobId = `fallback-${payload.reminderId}`;

    const job = await this.remindersQueue.add(
      'check-fallback-whatsapp',
      payload,
      {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
      },
    );

    this.logger.log(
      `Scheduled 15-minute fallback BullMQ job ${jobId} for reminder ${payload.reminderId}`,
    );

    return job;
  }

  /**
   * Reschedule / Snooze an existing BullMQ alarm job by delayMinutes (15 or 30 mins)
   */
  async snoozeReminderJob(
    payload: ReminderJobPayload,
    delayMinutes: number = 15,
  ): Promise<Job> {
    const jobId = `reminder-${payload.reminderId}`;
    const delayMs = delayMinutes * 60 * 1000;

    try {
      const existingJob = await this.remindersQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
      }
    } catch (err: any) {
      this.logger.warn(
        `Could not remove existing job ${jobId} before snoozing: ${err.message}`,
      );
    }

    const job = await this.remindersQueue.add('send-reminder', payload, {
      jobId,
      delay: delayMs,
      removeOnComplete: true,
      attempts: 3,
    });

    this.logger.log(
      `Snoozed BullMQ job ${jobId} for reminder ${payload.reminderId} by ${delayMinutes} mins (${delayMs}ms)`,
    );

    return job;
  }
}

@Processor(MEDICINE_REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushService: WebPushService,
    private readonly whatsAppService: WhatsAppService,
    private readonly remindersQueueService: RemindersQueueService,
    private readonly audioReminderService: AudioReminderService,
  ) {
    super();
  }

  async process(job: Job<ReminderJobPayload>): Promise<any> {
    const { name, data } = job;
    this.logger.log(
      `Processing job ${job.id} (${name}) for patient ${data.patientId}, reminder ${data.reminderId}`,
    );

    if (name === 'send-reminder') {
      return this.handleAlarmJob(job);
    } else if (name === 'check-fallback-whatsapp') {
      return this.handleFallbackJob(job);
    }

    return { status: 'IGNORED', name };
  }

  /**
   * Handle primary alarm job firing:
   * 1. Trigger Web Push Notification via webpush using stored VAPID subscription keys with custom alarm sound tag
   * 2. Synthesize Bengali bn-BD audio reminder clip via Google TTS / ElevenLabs & dispatch WhatsApp voice note
   * 3. For critical dosages (e.g. Insulin, Warfarin, Nitroglycerin), trigger automated IVR telephone call
   * 4. Schedule 15-minute delayed fallback check for unacknowledged alarm
   */
  private async handleAlarmJob(job: Job<ReminderJobPayload>): Promise<any> {
    const { reminderId, patientId } = job.data;

    // Fetch reminder DB details
    const reminder = await this.prisma.medicineReminder.findUnique({
      where: { id: reminderId },
      include: {
        prescriptionItem: {
          include: {
            prescription: true,
          },
        },
        patient: {
          include: {
            user: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    const medicineName = reminder?.prescriptionItem?.medicineName || 'Prescribed Medicine';
    const genericName = reminder?.prescriptionItem?.genericName || undefined;
    const diagnosis = reminder?.prescriptionItem?.prescription?.diagnosis || undefined;
    const schedulePattern = reminder?.prescriptionItem?.schedulePattern || '1+0+1';
    const patientPhone = reminder?.patient?.user?.phone || '8801700000000';
    const patientName = reminder?.patient?.user?.name || undefined;

    // 1) Trigger Web Push Notification via webpush using stored VAPID keys with custom alarm sound tag
    const pushResult = await this.webPushService.sendAlarmNotification(patientId, {
      reminderId,
      patientId,
      medicineName,
      schedulePattern,
      intakeTime: job.data.intakeTime,
    });

    // 2) Synthesize Bengali audio clip, send WhatsApp voice note & trigger IVR call for critical dosages
    let audioReminderResult: any = null;
    try {
      audioReminderResult = await this.audioReminderService.processAudioReminder({
        reminderId,
        patientId,
        medicineName,
        genericName,
        diagnosis,
        patientPhone,
        patientName,
        preferredLanguage: 'bn',
        schedulePattern,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to process audio reminder for ${reminderId}: ${err.message}`);
    }

    // 3) Schedule fallback job in 15 minutes to check if still unacknowledged
    await this.remindersQueueService.addFallbackCheckJob(job.data, 15 * 60 * 1000);

    return {
      status: 'ALARM_PUSH_SENT',
      reminderId,
      pushResult,
      audioReminderResult,
      fallbackScheduledInMinutes: 15,
    };
  }

  /**
   * Handle 15-minute fallback job:
   * Check if reminder is still unacknowledged (status PENDING). If unacknowledged, trigger WhatsApp fallback template message.
   */
  private async handleFallbackJob(job: Job<ReminderJobPayload>): Promise<any> {
    const { reminderId } = job.data;

    const reminder = await this.prisma.medicineReminder.findUnique({
      where: { id: reminderId },
      include: {
        prescriptionItem: true,
        patient: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!reminder) {
      return { status: 'NOT_FOUND', reminderId };
    }

    // If unacknowledged after 15 minutes (still PENDING)
    if (reminder.status === ReminderStatus.PENDING) {
      const patientName = reminder.patient?.user?.name || 'Patient';
      const patientPhone = reminder.patient?.user?.phone || '8801700000000';
      const medicineName = reminder.prescriptionItem?.medicineName || 'Prescribed Medicine';

      const whatsappResult = await this.whatsAppService.sendFallbackTemplateMessage({
        reminderId,
        patientName,
        patientPhone,
        medicineName,
        intakeTime: reminder.intakeTime,
      });

      this.logger.log(
        `Triggered WhatsApp fallback message for unacknowledged reminder ${reminderId}`,
      );

      return {
        status: 'WHATSAPP_FALLBACK_TRIGGERED',
        reminderId,
        whatsappResult,
      };
    }

    return {
      status: 'ALREADY_ACKNOWLEDGED',
      reminderId,
      currentStatus: reminder.status,
    };
  }
}
