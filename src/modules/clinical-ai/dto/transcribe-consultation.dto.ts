import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TranscribeConsultationDto {
  @ApiPropertyOptional({
    description: 'Appointment UUID associated with the consultation',
    example: 'appt-uuid-12345',
  })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiPropertyOptional({
    description: 'Language code for Whisper transcription (e.g. en, bn)',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Base64 encoded audio string if uploading via JSON payload',
    example: 'UklGRiQAAABXQVZFZm10I...',
  })
  @IsOptional()
  @IsString()
  audioBase64?: string;

  @ApiPropertyOptional({
    description: 'Existing raw consultation transcript text (if pre-transcribed on client)',
    example: 'Patient reports severe headache and fever for 2 days...',
  })
  @IsOptional()
  @IsString()
  existingTranscript?: string;
}
