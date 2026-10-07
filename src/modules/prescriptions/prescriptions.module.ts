import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../database/database.module.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { PrescriptionsController } from './prescriptions.controller.js';
import { RemindersController } from './reminders.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { DrugSafetyService } from './drug-safety.service.js';
import { PdfRendererService } from './pdf-renderer.service.js';
import { DosageParserService } from './dosage-parser.service.js';
import { WebPushService } from './web-push.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { AudioReminderService } from './audio-reminder.service.js';
import {
  RemindersQueueService,
  RemindersProcessor,
  MEDICINE_REMINDERS_QUEUE,
} from './reminders-queue.service.js';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: MEDICINE_REMINDERS_QUEUE,
    }),
  ],
  controllers: [PrescriptionsController, RemindersController],
  providers: [
    PrescriptionsService,
    DrugSafetyService,
    PdfRendererService,
    DosageParserService,
    RemindersQueueService,
    RemindersProcessor,
    WebPushService,
    WhatsAppService,
    AudioReminderService,
    S3Service,
  ],
  exports: [
    PrescriptionsService,
    DrugSafetyService,
    PdfRendererService,
    DosageParserService,
    RemindersQueueService,
    WebPushService,
    WhatsAppService,
    AudioReminderService,
    S3Service,
  ],
})
export class PrescriptionModule {}

