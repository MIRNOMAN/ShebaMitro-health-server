import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../database/database.module.js';
import { PrescriptionModule } from '../prescriptions/prescriptions.module.js';
import { PharmacyController } from './pharmacy.controller.js';
import { PharmacyService } from './pharmacy.service.js';
import { PrescriptionAiService } from './prescription-ai.service.js';
import {
  ChronicRefillService,
  CHRONIC_REFILL_QUEUE,
} from './chronic-refill.service.js';
import { ChronicRefillProcessor } from './chronic-refill.processor.js';

@Module({
  imports: [
    DatabaseModule,
    PrescriptionModule,
    BullModule.registerQueue({
      name: CHRONIC_REFILL_QUEUE,
    }),
  ],
  controllers: [PharmacyController],
  providers: [
    PharmacyService,
    PrescriptionAiService,
    ChronicRefillService,
    ChronicRefillProcessor,
  ],
  exports: [PharmacyService, PrescriptionAiService, ChronicRefillService],
})
export class PharmacyModule {}

