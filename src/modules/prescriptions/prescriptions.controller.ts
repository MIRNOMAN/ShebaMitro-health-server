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
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Prescriptions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Finalize and issue a medical prescription (Doctor only)',
    description:
      'Validates that appointment status is IN_PROGRESS. Accepts CreatePrescriptionDto (chiefComplaints[], clinicalDiagnosis[], vitalsJson, advice, followUpDate, items[]). Saves atomically in database and fires PrescriptionFinalizedEvent.',
  })
  @ResponseMessage('Prescription created and finalized successfully')
  async createPrescription(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.prescriptionsService.createPrescription(userId, dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get prescription details by ID' })
  @ResponseMessage('Prescription fetched successfully')
  async getPrescriptionById(@Param('id') prescriptionId: string) {
    return this.prescriptionsService.getPrescriptionById(prescriptionId);
  }
}
