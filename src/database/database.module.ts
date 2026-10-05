import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { PrismaModule } from './prisma.module.js';

/**
 * Global database module.
 * Provides and exports PrismaService and PrismaModule across the entire application.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [PrismaService],
  exports: [PrismaModule, PrismaService],
})
export class DatabaseModule {}
