import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealTiming } from '@prisma/client';
import { OverrideAcknowledgementDto } from './override-acknowledgement.dto.js';

export class VitalsDto {
  @ApiPropertyOptional({
    example: '120/80',
    description: 'Blood pressure in mmHg',
  })
  @IsOptional()
  @IsString()
  bp?: string;

  @ApiPropertyOptional({ example: 72, description: 'Heart pulse rate in bpm' })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  pulse?: number;

  @ApiPropertyOptional({
    example: 98,
    description: 'Oxygen saturation percentage',
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  spO2?: number;

  @ApiPropertyOptional({ example: 22.5, description: 'Body Mass Index' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(60)
  bmi?: number;
}

export class PrescriptionItemDto {
  @ApiProperty({
    example: 'Napa Extra',
    description: 'Trade name of the medicine',
  })
  @IsNotEmpty()
  @IsString()
  medicineName!: string;

  @ApiPropertyOptional({
    example: 'Paracetamol + Caffeine',
    description: 'Generic composition',
  })
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional({
    example: 'Tablet',
    description: 'Dosage form (e.g. Tablet, Syrup)',
  })
  @IsOptional()
  @IsString()
  dosageForm?: string;

  @ApiProperty({
    example: '1+0+1',
    description: 'Dose schedule frequency pattern (e.g. 1+0+1)',
  })
  @IsNotEmpty()
  @IsString()
  frequency!: string;

  @ApiProperty({ enum: MealTiming, default: MealTiming.AFTER_MEAL })
  @IsNotEmpty()
  @IsEnum(MealTiming)
  mealTiming!: MealTiming;

  @ApiProperty({ example: 7, description: 'Intake duration in days' })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Marks medication as chronic maintenance therapy',
  })
  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;
}

export class CreatePrescriptionDto {
  @ApiProperty({
    description: 'ID of the appointment',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;

  @ApiProperty({
    example: ['High fever', 'Dry cough'],
    description: 'List of chief patient complaints',
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  chiefComplaints!: string[];

  @ApiProperty({
    example: ['Acute Viral Bronchitis'],
    description: 'List of clinical diagnoses',
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  clinicalDiagnosis!: string[];

  @ApiPropertyOptional({
    type: VitalsDto,
    description: 'Patient vital signs (BP, Pulse, SpO2, BMI)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitalsJson?: VitalsDto;

  @ApiPropertyOptional({
    example: 'Rest for 3 days and drink plenty of warm water',
    description: 'Doctor advice',
  })
  @IsOptional()
  @IsString()
  advice?: string;

  @ApiPropertyOptional({
    example: '2026-10-15T10:00:00.000Z',
    description: 'Recommended follow up date',
  })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiProperty({
    type: [PrescriptionItemDto],
    description: 'Prescription medicine items',
  })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];

  @ApiPropertyOptional({
    type: OverrideAcknowledgementDto,
    description:
      'Electronic override acknowledgement for severe drug interaction/allergy conflicts',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OverrideAcknowledgementDto)
  overrideAcknowledgement?: OverrideAcknowledgementDto;
}
