import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SymptomTriageService } from './symptom-triage.service.js';
import { TriageRequestDto } from './dto/index.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('AI Symptom Triage')
@Controller('ai')
export class SymptomTriageController {
  constructor(private readonly symptomTriageService: SymptomTriageService) {}

  @Post('triage')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Perform AI-assisted symptom triage and doctor specialization matching',
    description:
      'Analyzes patient symptoms, duration, and severity using AI/clinical triage rules. Classifies urgency (EMERGENCY, MODERATE, NON_URGENT), identifies medical specialties, queries top 3 matching doctors, and includes mandatory medical disclaimers.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Symptom triage evaluation and top matching doctors returned successfully.',
  })
  @ResponseMessage('Symptom triage completed successfully')
  async triageSymptoms(@Body() dto: TriageRequestDto) {
    return this.symptomTriageService.triageSymptoms(dto);
  }
}
