import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSosDto {
  @ApiProperty({
    example: 23.8103,
    description: 'Patient latitude coordinate',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    example: 90.4125,
    description: 'Patient longitude coordinate',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description:
      'Patient Profile ID or User ID (optional if authenticated patient)',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    example: 'Patient experiencing severe chest pain and breathlessness',
    description: 'Additional notes or medical condition description',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '+8801712345678',
    description: 'Emergency contact phone number to receive SMS tracking alert',
  })
  @IsOptional()
  @IsString()
  emergencyContact?: string;
}
