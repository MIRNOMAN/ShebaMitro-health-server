import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { RedisModule } from '../../common/redis/redis.module.js';
import { RedlockService } from './redlock.service.js';
import { AppointmentsQueueService } from './appointments-queue.service.js';
import { AppointmentsGateway } from './appointments.gateway.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [AppointmentsController],
  providers: [
    RedlockService,
    AppointmentsQueueService,
    AppointmentsGateway,
    AppointmentsService,
  ],
  exports: [AppointmentsService, RedlockService, AppointmentsQueueService, AppointmentsGateway],
})
export class AppointmentsModule {}
