import {
  Controller,
  Put,
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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Medicine Reminders')
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
}
