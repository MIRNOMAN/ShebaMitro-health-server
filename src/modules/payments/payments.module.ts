import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { BkashService } from './bkash.service.js';
import { StripeService } from './stripe.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, BkashService, StripeService],
  exports: [PaymentsService, BkashService, StripeService],
})
export class PaymentModule {}
