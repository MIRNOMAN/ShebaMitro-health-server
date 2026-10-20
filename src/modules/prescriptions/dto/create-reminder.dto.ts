import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealTiming } from '@prisma/client';

export class CreateReminderDto {
  @ApiProperty({ example: 'Cefuroxime 500mg' })
  @IsString()
  @IsNotEmpty()
  medicineName!: string;

  @ApiPropertyOptional({ example: 'Cefuroxime Axetil' })
  @IsString()
  @IsOptional()
  genericName?: string;

  @ApiPropertyOptional({ example: 'Tablet' })
  @IsString()
  @IsOptional()
  dosageForm?: string;

  @ApiPropertyOptional({ example: '1+0+1' })
  @IsString()
  @IsOptional()
  schedulePattern?: string;

  @ApiPropertyOptional({ enum: MealTiming, default: MealTiming.AFTER_MEAL })
  @IsEnum(MealTiming)
  @IsOptional()
  mealTiming?: MealTiming;

  @ApiPropertyOptional({ example: 7 })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationDays?: number;

  @ApiPropertyOptional({ example: '2026-10-13T09:00:00.000Z' })
  @IsOptional()
  intakeTime?: string;

  @ApiPropertyOptional({ example: 'Take with full glass of water' })
  @IsString()
  @IsOptional()
  notes?: string;
}
