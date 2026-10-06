import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { EhrController } from './ehr.controller.js';
import { EhrService } from './ehr.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [EhrController],
  providers: [EhrService],
  exports: [EhrService],
})
export class EhrModule {}
