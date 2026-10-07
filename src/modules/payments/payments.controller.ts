import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Payments & Billing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 }, checkout: { limit: 5, ttl: 60000 } })
  @Post('initiate')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate payment for Appointments, LabOrders, or PharmacyOrders (Rate limited: 5 req/min)',
    description:
      'Supports bKash Tokenized Checkout and Stripe PaymentIntents. Calculates platform commission (15%) and provider payout (85%), with idempotency key duplicate prevention.',
  })
  @ResponseMessage('Payment initiation created successfully')
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(userId, dto);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'x-signature',
    description: 'Cryptographic HMAC SHA256 signature for webhook authentication',
    required: false,
  })
  @ApiOperation({
    summary: 'Robust payment webhook endpoint for bKash and Stripe',
    description:
      'Verifies cryptographic HMAC signature, checks idempotency keys to prevent duplicate transaction crediting, transitions order status to PAID/CONFIRMED, and automatically credits doctor/provider wallet balance.',
  })
  @ResponseMessage('Webhook processed successfully')
  async handleWebhook(
    @Headers('x-signature') xSignature: string,
    @Headers('stripe-signature') stripeSignature: string,
    @Req() req: any,
    @Body() payload: any,
  ) {
    const signature = xSignature || stripeSignature || req.headers['x-signature'] || req.headers['stripe-signature'] || '';
    const rawBody = req.rawBody || JSON.stringify(payload);

    return this.paymentsService.handleWebhook(rawBody, signature, payload);
  }

  @Get('wallet/:providerId')
  @Roles(Role.DOCTOR, Role.LAB, Role.PHARMACY, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get doctor/provider wallet balance and earnings breakdown',
    description: 'Fetches total earned revenue and current wallet balance for a doctor, lab, or pharmacy provider.',
  })
  @ResponseMessage('Provider wallet fetched successfully')
  async getProviderWallet(@Param('providerId') providerId: string) {
    return this.paymentsService.getProviderWallet(providerId);
  }
}
