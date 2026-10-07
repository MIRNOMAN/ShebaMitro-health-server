import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { AppointmentsService } from './appointments.service.js';

@Injectable()
export class AppointmentsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentsQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly fallbackTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const connection = { host, port };

    try {
      this.queue = new Queue('appointment-expiration', { connection });

      this.worker = new Worker(
        'appointment-expiration',
        async (job: Job<{ appointmentId: string }>) => {
          this.logger.log(
            `BullMQ Worker processing expiration job for appointment: ${job.data.appointmentId}`,
          );
          await this.appointmentsService.handleExpiredAppointment(
            job.data.appointmentId,
          );
        },
        { connection },
      );

      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `Expiration job failed for appointment ${job?.data?.appointmentId}: ${err.message}`,
        );
      });

      this.logger.log(
        'BullMQ appointment-expiration queue & worker initialized',
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to initialize BullMQ queue/worker: ${err.message}`,
      );
    }
  }

  /**
   * Schedule appointment expiration job in BullMQ (default 10-minute grace period)
   */
  async addExpirationJob(
    appointmentId: string,
    delayMs: number = 10 * 60 * 1000,
  ): Promise<void> {
    let queuedInBullMQ = false;

    if (this.queue) {
      try {
        await this.queue.add(
          'expire-appointment',
          { appointmentId },
          {
            jobId: `expire-${appointmentId}`,
            delay: delayMs,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
        queuedInBullMQ = true;
        this.logger.log(
          `Recorded appointment expiration job in BullMQ for appointment ID: ${appointmentId} (delay: ${delayMs}ms)`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Could not add job to BullMQ queue: ${err.message}. Using fallback timer.`,
        );
      }
    }

    // Backup timer fallback (for dev/test environments without active Redis queue)
    if (!queuedInBullMQ) {
      if (this.fallbackTimers.has(appointmentId)) {
        clearTimeout(this.fallbackTimers.get(appointmentId));
      }
      const timer = setTimeout(async () => {
        this.fallbackTimers.delete(appointmentId);
        await this.appointmentsService.handleExpiredAppointment(appointmentId);
      }, delayMs);

      this.fallbackTimers.set(appointmentId, timer);
      this.logger.log(
        `Recorded fallback in-memory expiration timer for appointment ID: ${appointmentId}`,
      );
    }
  }

  /**
   * Remove appointment expiration job if payment succeeds
   */
  async removeExpirationJob(appointmentId: string): Promise<void> {
    if (this.queue) {
      try {
        const jobId = `expire-${appointmentId}`;
        const job = await this.queue.getJob(jobId);
        if (job) {
          await job.remove();
          this.logger.log(
            `Removed BullMQ expiration job for appointment ID: ${appointmentId}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to remove BullMQ job for appointment ${appointmentId}: ${err.message}`,
        );
      }
    }

    if (this.fallbackTimers.has(appointmentId)) {
      clearTimeout(this.fallbackTimers.get(appointmentId));
      this.fallbackTimers.delete(appointmentId);
      this.logger.log(
        `Cleared fallback expiration timer for appointment ID: ${appointmentId}`,
      );
    }
  }

  async onModuleDestroy() {
    for (const timer of this.fallbackTimers.values()) {
      clearTimeout(timer);
    }
    this.fallbackTimers.clear();

    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }
}
