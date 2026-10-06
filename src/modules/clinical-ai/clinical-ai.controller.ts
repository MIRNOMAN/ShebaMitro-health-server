import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VoiceScribeService } from './voice-scribe.service.js';
import { TranscribeConsultationDto } from './dto/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Clinical AI & Voice Scribe')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('clinical-ai')
export class ClinicalAiController {
  constructor(private readonly voiceScribeService: VoiceScribeService) {}

  @Post('transcribe-consultation')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Transcribe live consultation audio and generate structured SOAP notes',
    description:
      'Feeds live consultation audio chunk into OpenAI Whisper API for transcription, then processes transcript through an LLM pipeline to extract SOAP notes (Subjective, Objective, Assessment, Plan), chief complaints, and draft suggested medications for doctor verification before saving.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audio transcribed and structured clinical SOAP notes with suggested medications returned successfully.',
  })
  @ResponseMessage('Consultation audio transcribed and SOAP notes parsed successfully')
  async transcribeConsultation(
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: TranscribeConsultationDto,
  ) {
    return this.voiceScribeService.transcribeConsultation(file, dto);
  }
}
