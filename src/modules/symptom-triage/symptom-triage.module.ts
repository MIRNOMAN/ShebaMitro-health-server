import { Module } from '@nestjs/common';
import { SymptomTriageController } from './symptom-triage.controller.js';
import { SymptomTriageService } from './symptom-triage.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [SymptomTriageController],
  providers: [SymptomTriageService],
  exports: [SymptomTriageService],
})
export class SymptomTriageModule {}
