import { Module } from '@nestjs/common';
import { ClinicalAiController } from './clinical-ai.controller.js';
import { VoiceScribeService } from './voice-scribe.service.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ClinicalAiController],
  providers: [VoiceScribeService],
  exports: [VoiceScribeService],
})
export class ClinicalAiModule {}
