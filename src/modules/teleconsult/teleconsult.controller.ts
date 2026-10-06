import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeleconsultService } from './teleconsult.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Teleconsultation')
@ApiBearerAuth()
@Controller('teleconsult')
export class TeleconsultController {
  constructor(private readonly teleconsultService: TeleconsultService) {}

  @Get(':appointmentId/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate dynamic Agora RTC access token for teleconsultation video session',
    description:
      'Validates appointment slot time window (+-15 minutes of slot start), verifies caller identity, and generates dynamic Agora RTC access tokens with role-specific privileges (Publisher for Doctor/Patient, Subscriber for Assistants).',
  })
  @ResponseMessage('Teleconsultation RTC token generated successfully')
  async getRtcToken(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teleconsultService.generateRtcToken(userId, appointmentId);
  }
}
