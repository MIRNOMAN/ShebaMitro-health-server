import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { DrugSafetyService } from './drug-safety.service.js';
import { PdfRendererService } from './pdf-renderer.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PrescriptionsController],
  providers: [
    PrescriptionsService,
    DrugSafetyService,
    PdfRendererService,
    S3Service,
  ],
  exports: [PrescriptionsService, DrugSafetyService, PdfRendererService, S3Service],
})
export class PrescriptionModule {}
