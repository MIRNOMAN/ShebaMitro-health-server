import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';

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
}

@Processor(MEDICINE_REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  async process(job: Job<ReminderJobPayload>): Promise<any> {
    this.logger.log(
      `Processing medicine reminder job ${job.id} for patient ${job.data.patientId}, item ${job.data.prescriptionItemId}`,
    );

    return {
      status: 'SENT',
      reminderId: job.data.reminderId,
      processedAt: new Date().toISOString(),
    };
  }
}
