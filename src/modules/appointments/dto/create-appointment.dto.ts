import { IsNotEmpty, IsString, IsUUID, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'ID of the doctor profile', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsNotEmpty()
  @IsUUID()
  doctorId!: string;

  @ApiProperty({ description: 'Start time of the slot in ISO format', example: '2026-10-10T10:00:00.000Z' })
  @IsNotEmpty()
  @IsDateString()
  slotStartTime!: string;

  @ApiProperty({ description: 'End time of the slot in ISO format', example: '2026-10-10T10:30:00.000Z' })
  @IsNotEmpty()
  @IsDateString()
  slotEndTime!: string;

  @ApiPropertyOptional({ enum: AppointmentType, default: AppointmentType.ONLINE })
  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @ApiPropertyOptional({ description: 'Additional notes or patient complaints' })
  @IsOptional()
  @IsString()
  notes?: string;
}
