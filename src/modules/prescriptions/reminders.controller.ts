import {
  Controller,
  Put,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DosageParserService } from './dosage-parser.service.js';
import { AcknowledgeReminderDto } from './dto/acknowledge-reminder.dto.js';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Alarms', 'Medicine Reminders')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly dosageParserService: DosageParserService) {}

  @Put(':id/acknowledge')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge medicine reminder intake status (Patient only)',
    description:
      'Records TAKEN or SKIPPED status for a medicine reminder and computes updated patient compliance rate.',
  })
  @ResponseMessage('Medicine reminder acknowledged successfully')
  async acknowledgeReminder(
    @CurrentUser('id') userId: string,
    @Param('id') reminderId: string,
    @Body() dto: AcknowledgeReminderDto,
  ) {
    return this.dosageParserService.acknowledgeReminder(
      userId,
      reminderId,
      dto.status,
    );
  }

  @Put(':id/snooze')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Snooze medicine reminder alarm (Patient only)',
    description:
      'Delays medicine reminder alarm by 15 or 30 minutes in BullMQ and updates scheduled intake time in database.',
  })
  @ResponseMessage('Medicine reminder alarm snoozed successfully')
  async snoozeReminder(
    @CurrentUser('id') userId: string,
    @Param('id') reminderId: string,
    @Body() dto: SnoozeReminderDto,
  ) {
    return this.dosageParserService.snoozeReminder(
      userId,
      reminderId,
      dto.minutes ?? 15,
    );
  }

  @Get('compliance/:patientId')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get patient medication adherence percentage and compliance report',
    description:
      'Calculates adherence percentage (Doses Taken on Time / Total Prescribed Doses). If adherence falls below 70%, triggers automated push reminder to patient and flags an adherence alert on doctor upcoming follow-up appointment view.',
  })
  @ResponseMessage('Patient compliance report generated successfully')
  async getPatientCompliance(@Param('patientId') patientId: string) {
    return this.dosageParserService.getPatientCompliance(patientId);
  }
}

