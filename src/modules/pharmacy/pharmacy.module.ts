import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PharmacyController } from './pharmacy.controller.js';
import { PharmacyService } from './pharmacy.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PharmacyController],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
