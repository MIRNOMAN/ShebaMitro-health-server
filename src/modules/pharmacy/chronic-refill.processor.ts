import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service.js';
import { WhatsAppService } from '../prescriptions/whatsapp.service.js';
import { WebPushService } from '../prescriptions/web-push.service.js';
import { CHRONIC_REFILL_QUEUE, ChronicRefillJobPayload } from './chronic-refill.service.js';

@Injectable()
@Processor(CHRONIC_REFILL_QUEUE)
export class ChronicRefillProcessor extends WorkerHost {
  private readonly logger = new Logger(ChronicRefillProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
    private readonly webPushService: WebPushService,
  ) {
    super();
  }

  async process(job: Job<ChronicRefillJobPayload>): Promise<any> {
    const { name, data } = job;
    this.logger.log(
      `Processing BullMQ chronic refill reminder job ${job.id} (${name}) for patient ${data.patientId}, medicine: ${data.medicineName}`,
    );

    if (name === 'send-chronic-refill-reminder') {
      return this.handleChronicRefillReminder(job);
    }

    return { status: 'IGNORED', name };
  }

  /**
   * Handle BullMQ 72h-prior chronic refill reminder execution:
   * 1. Dispatch WhatsApp notification with 1-click reorder CTA
   * 2. Dispatch Web Push notification with 1-click reorder CTA action
   */
  private async handleChronicRefillReminder(job: Job<ChronicRefillJobPayload>): Promise<any> {
    const {
      prescriptionId,
      prescriptionItemId,
      patientId,
      medicineName,
      depletionDate,
      reorderUrl,
    } = job.data;

    // 1. Fetch Patient and User details
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    const patientName = patientProfile?.user?.name || 'Patient';
    const patientPhone = patientProfile?.user?.phone || '8801700000000';
    const defaultReorderEndpoint = `/api/v1/pharmacy/refill-order`;
    const actionUrl = reorderUrl || `${defaultReorderEndpoint}?prescriptionId=${prescriptionId}&prescriptionItemId=${prescriptionItemId}`;

    // 2. Dispatch WhatsApp 72-hour reminder
    const whatsappResult = await this.whatsAppService.sendChronicRefillReminder({
      patientPhone,
      patientName,
      medicineName,
      depletionDate,
      prescriptionId,
      reorderUrl: actionUrl,
    });

    // 3. Dispatch Web Push 72-hour notification
    const pushResult = await this.webPushService.sendChronicRefillNotification(patientId, {
      patientId,
      prescriptionId,
      medicineName,
      depletionDate,
      reorderEndpoint: defaultReorderEndpoint,
    });

    this.logger.log(
      `Dispatched 72-hour chronic refill notifications (WhatsApp & Push) for patient ${patientId} (prescription: ${prescriptionId}, medicine: ${medicineName})`,
    );

    return {
      status: 'REFILL_REMINDERS_SENT',
      prescriptionId,
      prescriptionItemId,
      patientId,
      medicineName,
      depletionDate,
      whatsappResult,
      pushResult,
      reorderEndpoint: defaultReorderEndpoint,
      reorderUrl: actionUrl,
    };
  }
}
