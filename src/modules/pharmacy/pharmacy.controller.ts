import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { PharmacyService } from './pharmacy.service.js';
import { ChronicRefillService } from './chronic-refill.service.js';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto.js';
import { RefillOrderDto } from './dto/refill-order.dto.js';
import { QueryMedicinesDto } from './dto/query-medicines.dto.js';
import { ScanPrescriptionDto } from './dto/scan-prescription.dto.js';
import { CheckoutCartDto } from './dto/checkout-cart.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Pharmacy & Medicine Orders', 'Refills', 'AI Prescription Scanner')
@Controller('pharmacy')
export class PharmacyController {
  constructor(
    private readonly pharmacyService: PharmacyService,
    private readonly chronicRefillService: ChronicRefillService,
  ) {}

  @Public()
  @Get('medicines')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dynamic list of medicines (Public with Search and Category filters)',
  })
  @ResponseMessage('Medicines retrieved successfully')
  async getMedicines(@Query() query: QueryMedicinesDto) {
    return this.pharmacyService.getMedicines(query);
  }

  @Public()
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all pharmacy categories with real-time stock counts',
  })
  @ResponseMessage('Pharmacy categories retrieved successfully')
  async getCategories() {
    return this.pharmacyService.getCategories();
  }

  @Public()
  @Get('medicines/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single medicine details by ID' })
  @ResponseMessage('Medicine details retrieved successfully')
  async getMedicineById(@Param('id') id: string) {
    return this.pharmacyService.getMedicineById(id);
  }

  @Public()
  @Post('scan-prescription')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Free AI Prescription Reader & OCR scanner',
    description:
      'Reads doctor prescriptions via Free Google Gemini Vision or intelligent medical NLP, matches detected items against the database catalog, and returns auto-cart ready medicines.',
  })
  @ResponseMessage('Prescription scanned and medicines recognized successfully')
  async scanPrescription(
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: ScanPrescriptionDto,
  ) {
    return this.pharmacyService.scanPrescription(file, dto);
  }

  @Public()
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Checkout cart order (Supports COD, bKash, and Express 2-Hour Delivery)',
  })
  @ResponseMessage('Pharmacy order placed successfully')
  async checkoutCart(
    @Body() dto: CheckoutCartDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.pharmacyService.checkoutCart(userId, dto);
  }

  @Throttle({
    default: { limit: 5, ttl: 60000 },
    checkout: { limit: 5, ttl: 60000 },
  })
  @Post('orders')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Convert verified prescription items into a pharmacy cart order (Rate limited: 5 req/min)',
  })
  @ResponseMessage('Pharmacy cart order created successfully from prescription')
  async createCartOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePharmacyOrderDto,
  ) {
    return this.pharmacyService.createCartOrder(userId, dto);
  }

  @Throttle({
    default: { limit: 5, ttl: 60000 },
    checkout: { limit: 5, ttl: 60000 },
  })
  @Post('refill-order')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      '1-click chronic medicine refill re-order (Rate limited: 5 req/min)',
  })
  @ResponseMessage('Chronic medicine refill order provisioned successfully')
  async refillOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: RefillOrderDto,
  ) {
    return this.chronicRefillService.provisionRefillOrder(userId, dto);
  }

  @Get('verify-qr/:hash')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.PHARMACY, Role.ADMIN, Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify prescription QR code signature and dispense medication (Pharmacist)',
  })
  @ResponseMessage(
    'Prescription QR code verified and marked DISPENSED upon checkout',
  )
  async verifyQrAndDispense(
    @Param('hash') hash: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.pharmacyService.verifyQrAndDispense(hash, userId);
  }
}
