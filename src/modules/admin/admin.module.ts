import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService, AuditLogInterceptor],
  exports: [AdminService],
})
export class AdminModule {}
