import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VitalsSyncService } from './vitals-sync.service.js';
import { SyncVitalsDto } from './dto/sync-vitals.dto.js';
import { CreateVitalDto } from './dto/create-vital.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Biometric Vitals Sync')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('vitals')
export class VitalsSyncController {
  constructor(private readonly vitalsSyncService: VitalsSyncService) {}

  @Post('sync')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Bulk ingest biometric vitals with idempotency keys & real-time emergency alerting',
    description:
      'Invisibly or explicitly ingest bulk biometric vital readings (HEART_RATE, BP, GLUCOSE, SPO2). Enforces idempotency via idempotencyKey. Evaluates threshold alerts (SpO2 < 92% or Systolic BP > 160) and notifies assigned cardiologists in real-time over WebSockets while logging alert events in DB.',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description:
      'Batch-level idempotency key to prevent duplicate bulk ingestion',
  })
  @ResponseMessage('Biometric vitals synced successfully')
  async syncVitals(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() body: SyncVitalsDto | CreateVitalDto[],
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ) {
    // Normalize body if an array of vitals is directly passed
    let dto: SyncVitalsDto;
    if (Array.isArray(body)) {
      dto = { vitals: body };
    } else {
      dto = body;
    }

    return this.vitalsSyncService.syncVitals(
      userId,
      role,
      dto,
      headerIdempotencyKey,
    );
  }

  @Get('patient/:patientId')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get recent biometric vitals for a patient' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of records (default: 50)',
  })
  @ResponseMessage('Biometric vitals fetched successfully')
  async getPatientVitals(
    @Param('patientId') patientId: string,
    @Query('limit') limit?: number,
  ) {
    return this.vitalsSyncService.getPatientVitals(
      patientId,
      limit ? Number(limit) : 50,
    );
  }

  @Get('alerts')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get emergency vital alerts' })
  @ApiQuery({ name: 'patientId', required: false, type: String })
  @ApiQuery({ name: 'doctorId', required: false, type: String })
  @ResponseMessage('Emergency alerts fetched successfully')
  async getAlerts(
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.vitalsSyncService.getAlerts({ patientId, doctorId });
  }
}
