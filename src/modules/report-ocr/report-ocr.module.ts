import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import {
  ReportOcrController,
  BiomarkerAnalyticsController,
} from './report-ocr.controller.js';
import { ReportOcrService } from './report-ocr.service.js';
import { OcrEngineService } from './ocr-engine.service.js';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [ReportOcrController, BiomarkerAnalyticsController],
  providers: [ReportOcrService, OcrEngineService],
  exports: [ReportOcrService, OcrEngineService],
})
export class ReportOcrModule {}
