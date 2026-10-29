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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { VerifyDrugSafetyDto } from './dto/verify-drug-safety.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Prescriptions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post('verify-safety')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify drug-drug interactions and patient allergy safety',
    description:
      'Cross-references prescribed medications against known drug interaction database tables and patient allergy list. Returns severity levels: SAFE, MODERATE, SEVERE. Flags if SEVERE conflict requires an electronic override acknowledgement.',
  })
  @ResponseMessage('Drug safety verification completed')
  async verifyDrugSafety(@Body() dto: VerifyDrugSafetyDto) {
    return this.prescriptionsService.verifyDrugSafety(dto);
  }

  @Post()
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Finalize and issue a medical prescription (Doctor only)',
    description:
      'Validates that appointment status is IN_PROGRESS. Verifies drug safety; if SEVERE conflict is flagged (e.g. Warfarin + Aspirin), blocks submission until doctor submits an electronic override acknowledgement with clinical justification.',
  })
  @ResponseMessage('Prescription created and finalized successfully')
  async createPrescription(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.prescriptionsService.createPrescription(userId, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all prescriptions for the logged-in patient' })
  @ApiQuery({ name: 'patientId', required: false, description: 'Optional Patient Profile ID filter' })
  @ResponseMessage('Prescriptions fetched successfully')
  async getMyPrescriptions(
    @CurrentUser('id') userId?: string,
    @Query('patientId') queryPatientId?: string,
  ) {
    return this.prescriptionsService.getPatientPrescriptions(userId, queryPatientId);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get prescription details by ID' })
  @ResponseMessage('Prescription fetched successfully')
  async getPrescriptionById(@Param('id') prescriptionId: string) {
    return this.prescriptionsService.getPrescriptionById(prescriptionId);
  }
}
