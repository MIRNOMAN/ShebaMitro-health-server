import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EhrService } from './ehr.service.js';
import { FilterEhrDto, EhrRecordType } from './dto/filter-ehr.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Electronic Health Record (EHR)')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('ehr')
export class EhrController {
  constructor(private readonly ehrService: EhrService) {}

  @Get('patient/:id')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get aggregated patient Electronic Health Record (EHR)',
    description:
      'Aggregates historical visits, doctor diagnoses, lab reports, and medication histories. Enforces strict consent policies (accessible only by the patient themselves or a doctor with a currently active appointment). Supports dateRange, recordType, and doctorSpecialty filters.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date ISO string',
  })
  @ApiQuery({ name: 'to', required: false, description: 'End date ISO string' })
  @ApiQuery({
    name: 'recordType',
    required: false,
    enum: EhrRecordType,
    description: 'Filter by PRESCRIPTION, LAB_REPORT, or CLINICAL_NOTE',
  })
  @ApiQuery({
    name: 'doctorSpecialty',
    required: false,
    description: 'Filter by doctor specialization (e.g., Cardiology)',
  })
  @ResponseMessage('Patient EHR records aggregated successfully')
  async getPatientEhr(
    @CurrentUser('id') callerUserId: string,
    @CurrentUser('role') callerRole: string,
    @Param('id') targetPatientId: string,
    @Query() dto: FilterEhrDto,
  ) {
    return this.ehrService.getPatientEhr(
      callerUserId,
      callerRole,
      targetPatientId,
      dto,
    );
  }
}
