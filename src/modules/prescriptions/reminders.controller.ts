import {
  Controller,
  Put,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DosageParserService } from './dosage-parser.service.js';
import { AcknowledgeReminderDto } from './dto/acknowledge-reminder.dto.js';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto.js';
import { CreateReminderDto } from './dto/create-reminder.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Alarms', 'Medicine Reminders')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly dosageParserService: DosageParserService) {}

  /**
   * 1. Get all medicine reminders and patient adherence summary
   * GET /api/v1/reminders
   */
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all medicine reminders and compliance summary for patient',
  })
  @ResponseMessage('Medicine reminders retrieved successfully')
  async getReminders(
    @CurrentUser('id') userId?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.dosageParserService.getPatientReminders(userId, patientId);
  }

  /**
   * 2. Add a new custom medication schedule / reminder
   * POST /api/v1/reminders
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new medication schedule and reminder alarm',
  })
  @ResponseMessage('Medication reminder scheduled successfully')
  async createReminder(
    @CurrentUser('id') userId?: string,
    @Body() dto?: CreateReminderDto,
  ) {
    return this.dosageParserService.createCustomReminder(userId, dto);
  }

  /**
   * 3. Acknowledge reminder (TAKEN or SKIPPED)
   * PUT /api/v1/reminders/:id/acknowledge
   */
  @Put(':id/acknowledge')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge medicine reminder intake status',
    description:
      'Records TAKEN or SKIPPED status for a medicine reminder and computes updated patient compliance rate.',
  })
  @ResponseMessage('Medicine reminder acknowledged successfully')
  async acknowledgeReminder(
    @Param('id') reminderId: string,
    @Body() dto: AcknowledgeReminderDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.dosageParserService.acknowledgeReminder(
      userId,
      reminderId,
      dto.status,
    );
  }

  /**
   * 4. Snooze reminder alarm
   * PUT /api/v1/reminders/:id/snooze
   */
  @Put(':id/snooze')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Snooze medicine reminder alarm',
    description:
      'Delays medicine reminder alarm by 15 or 30 minutes in BullMQ and updates scheduled intake time in database.',
  })
  @ResponseMessage('Medicine reminder alarm snoozed successfully')
  async snoozeReminder(
    @Param('id') reminderId: string,
    @Body() dto: SnoozeReminderDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.dosageParserService.snoozeReminder(
      userId,
      reminderId,
      dto.minutes ?? 15,
    );
  }

  /**
   * 5. Delete a medication reminder
   * DELETE /api/v1/reminders/:id
   */
  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a medication reminder schedule',
  })
  @ResponseMessage('Medicine reminder deleted successfully')
  async deleteReminder(
    @Param('id') reminderId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.dosageParserService.deleteReminder(userId, reminderId);
  }

  /**
   * 6. Get compliance report
   * GET /api/v1/reminders/compliance/:patientId
   */
  @Get('compliance/:patientId')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get patient medication adherence percentage and compliance report',
  })
  @ResponseMessage('Patient compliance report generated successfully')
  async getPatientCompliance(@Param('patientId') patientId: string) {
    return this.dosageParserService.getPatientCompliance(patientId);
  }
}
