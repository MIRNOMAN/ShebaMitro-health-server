import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionModule {}
