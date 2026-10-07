import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { AppointmentType } from '@prisma/client';

export class BookFamilyAppointmentDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID of DoctorProfile to book appointment with',
  })
  @IsNotEmpty()
  @IsString()
  doctorId!: string;

  @ApiProperty({
    example: '2026-10-10T10:00:00.000Z',
    description: 'ISO start timestamp of the appointment slot',
  })
  @IsNotEmpty()
  @IsDateString()
  slotStartTime!: string;

  @ApiProperty({
    example: '2026-10-10T10:30:00.000Z',
    description: 'ISO end timestamp of the appointment slot',
  })
  @IsNotEmpty()
  @IsDateString()
  slotEndTime!: string;

  @ApiPropertyOptional({
    enum: AppointmentType,
    example: AppointmentType.ONLINE,
    description: 'Type of appointment: ONLINE or CHAMBER',
  })
  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType = AppointmentType.ONLINE;

  @ApiPropertyOptional({
    example: 'Routine checkup for mother',
    description: 'Additional clinical notes or patient complaints',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
