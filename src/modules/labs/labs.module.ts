import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';
import { LabReportCryptoService } from './lab-report-crypto.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [LabsController],
  providers: [LabsService, LabReportCryptoService, S3Service],
  exports: [LabsService, LabReportCryptoService],
})
export class LabModule {}
