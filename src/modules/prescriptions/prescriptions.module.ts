import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { DrugSafetyService } from './drug-safety.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, DrugSafetyService],
  exports: [PrescriptionsService, DrugSafetyService],
})
export class PrescriptionModule {}
