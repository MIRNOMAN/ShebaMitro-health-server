import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { VitalType } from '@prisma/client';

export class CreateVitalDto {
  @ApiPropertyOptional({
    description: 'Patient Profile ID or User ID (optional if submitted by authenticated patient)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({
    enum: VitalType,
    example: VitalType.SPO2,
    description: 'Biometric vital type: HEART_RATE, BP, GLUCOSE, SPO2',
  })
  @IsNotEmpty()
  @IsEnum(VitalType)
  type!: VitalType;

  @ApiProperty({
    example: 90,
    description: 'Numeric value of the vital reading (e.g. 90 for SpO2, 165 for Systolic BP)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  value!: number;

  @ApiProperty({
    example: '%',
    description: 'Measurement unit (%, mmHg, bpm, mg/dL)',
  })
  @IsNotEmpty()
  @IsString()
  unit!: string;

  @ApiProperty({
    example: '2026-10-07T11:00:00.000Z',
    description: 'ISO timestamp when vital was recorded',
  })
  @IsNotEmpty()
  @IsDateString()
  recordedAt!: string;

  @ApiPropertyOptional({
    example: 'vital-key-101',
    description: 'Unique idempotency key per vital reading to prevent duplicate ingestion',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
