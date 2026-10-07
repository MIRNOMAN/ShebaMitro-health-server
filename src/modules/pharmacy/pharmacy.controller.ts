import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { PharmacyService } from './pharmacy.service.js';
import { ChronicRefillService } from './chronic-refill.service.js';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto.js';
import { RefillOrderDto } from './dto/refill-order.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Pharmacy & Medicine Orders', 'Refills')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(
    private readonly pharmacyService: PharmacyService,
    private readonly chronicRefillService: ChronicRefillService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60000 }, checkout: { limit: 5, ttl: 60000 } })
  @Post('orders')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Convert verified prescription items into a pharmacy cart order (Rate limited: 5 req/min)',
    description:
      'Converts prescribed medication items from a verified medical prescription into an actionable pharmacy cart order for delivery.',
  })
  @ResponseMessage('Pharmacy cart order created successfully from prescription')
  async createCartOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePharmacyOrderDto,
  ) {
    return this.pharmacyService.createCartOrder(userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 }, checkout: { limit: 5, ttl: 60000 } })
  @Post('refill-order')
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '1-click chronic medicine refill re-order (Rate limited: 5 req/min)',
    description:
      'Automatically provisions a refill order with patient preferred partner pharmacy, computes standard maintenance quantity and delivery fee, and schedules the next cycle reminder.',
  })
  @ResponseMessage('Chronic medicine refill order provisioned successfully')
  async refillOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: RefillOrderDto,
  ) {
    return this.chronicRefillService.provisionRefillOrder(userId, dto);
  }

  @Get('verify-qr/:hash')
  @Roles(Role.PHARMACY, Role.ADMIN, Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify prescription QR code signature and dispense medication (Pharmacist)',
    description:
      'Verifies doctor digital signature legitimacy, checks previous dispense history to prevent duplicate dispensing of controlled substances/narcotics, and updates prescription status to DISPENSED upon checkout.',
  })
  @ResponseMessage('Prescription QR code verified and marked DISPENSED upon checkout')
  async verifyQrAndDispense(
    @Param('hash') hash: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.pharmacyService.verifyQrAndDispense(hash, userId);
  }
}
