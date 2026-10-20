import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PharmacyService } from './pharmacy.service.js';
import { QueryMedicinesDto } from './dto/query-medicines.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Medicines & MediData API (Open Access)')
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  /**
   * GET /api/v1/medicines
   * Supports:
   *  GET /api/v1/medicines
   *  GET /api/v1/medicines?search=napa
   *  GET /api/v1/medicines?category=pain&page=1&limit=20
   */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List and search medicines (MediData compatible format)',
  })
  @ResponseMessage('Medicines retrieved successfully')
  async getMedicines(@Query() query: QueryMedicinesDto) {
    return this.pharmacyService.getMedicines(query);
  }

  /**
   * POST /api/v1/medicines/sync
   * Trigger MediData live synchronizer
   */
  @Public()
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync popular medications from MediData API',
  })
  @ResponseMessage('MediData medications synced successfully')
  async syncMediData() {
    return this.pharmacyService.syncMediData();
  }

  /**
   * GET /api/v1/medicines/:id
   * Supports both internal UUID and MediData numeric IDs (e.g. 14742, 1, 2)
   */
  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get single medicine details by ID (MediData compatible)',
  })
  @ResponseMessage('Medicine details retrieved successfully')
  async getMedicineById(@Param('id') id: string) {
    return this.pharmacyService.getMedicineById(id);
  }
}
