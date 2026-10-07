import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class TriageRequestDto {
  @ApiProperty({
    description: 'Patient symptoms description',
    example:
      'Sudden onset chest pain radiating to left shoulder and shortness of breath',
  })
  @IsString()
  @IsNotEmpty()
  symptoms!: string;

  @ApiProperty({
    description: 'Duration of the symptoms',
    example: '45 minutes',
  })
  @IsString()
  @IsNotEmpty()
  duration!: string;

  @ApiProperty({
    description:
      'Severity level (e.g. MILD, MODERATE, SEVERE, or numeric scale 1-10)',
    example: 'SEVERE',
  })
  @IsString()
  @IsNotEmpty()
  severity!: string;

  @ApiPropertyOptional({ description: 'Patient age in years', example: 52 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ description: 'Patient gender', example: 'Male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    description: 'Existing medical conditions or additional clinical context',
    example: 'Hypertension, High Cholesterol',
  })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}
