import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ScanPrescriptionDto {
  @ApiPropertyOptional({ description: 'Base64 encoded prescription image data URL' })
  @IsOptional()
  @IsString()
  imageBase64?: string;

  @ApiPropertyOptional({ description: 'Existing public URL or storage path of the prescription image' })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Optional raw OCR or transcription text to parse' })
  @IsOptional()
  @IsString()
  rawText?: string;
}
