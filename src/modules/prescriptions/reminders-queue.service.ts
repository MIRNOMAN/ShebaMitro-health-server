import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { WebPushService } from './web-push.service.js';
import { WhatsAppService } from './whatsapp.service.js';

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
}

@Processor(MEDICINE_REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushService: WebPushService,
    private readonly whatsAppService: WhatsAppService,
    private readonly remindersQueueService: RemindersQueueService,
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
   * 2. Schedule 15-minute delayed fallback check for unacknowledged alarm
   */
  private async handleAlarmJob(job: Job<ReminderJobPayload>): Promise<any> {
    const { reminderId, patientId } = job.data;

    // Fetch reminder DB details
    const reminder = await this.prisma.medicineReminder.findUnique({
      where: { id: reminderId },
      include: {
        prescriptionItem: true,
        patient: {
          include: {
            user: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    const medicineName = reminder?.prescriptionItem?.medicineName || 'Prescribed Medicine';
    const schedulePattern = reminder?.prescriptionItem?.schedulePattern || '1+0+1';

    // 1) Trigger Web Push Notification via webpush using stored VAPID keys with custom alarm sound tag
    const pushResult = await this.webPushService.sendAlarmNotification(patientId, {
      reminderId,
      patientId,
      medicineName,
      schedulePattern,
      intakeTime: job.data.intakeTime,
    });

    // 2) Schedule fallback job in 15 minutes to check if still unacknowledged
    await this.remindersQueueService.addFallbackCheckJob(job.data, 15 * 60 * 1000);

    return {
      status: 'ALARM_PUSH_SENT',
      reminderId,
      pushResult,
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
