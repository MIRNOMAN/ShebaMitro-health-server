import { Module } from '@nestjs/common';
import { VitalsSyncController } from './vitals-sync.controller.js';
import { VitalsSyncService } from './vitals-sync.service.js';
import { VitalsSyncGateway } from './vitals-sync.gateway.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [VitalsSyncController],
  providers: [VitalsSyncService, VitalsSyncGateway],
  exports: [VitalsSyncService, VitalsSyncGateway],
})
export class VitalsSyncModule {}
