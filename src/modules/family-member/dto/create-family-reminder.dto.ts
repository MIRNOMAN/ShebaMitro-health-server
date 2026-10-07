import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString } from 'class-validator';

export class CreateFamilyReminderDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Prescription Item ID for the medicine',
  })
  @IsNotEmpty()
  @IsString()
  prescriptionItemId!: string;

  @ApiProperty({
    example: '2026-10-10T08:00:00.000Z',
    description: 'ISO timestamp for medicine intake alarm',
  })
  @IsNotEmpty()
  @IsDateString()
  intakeTime!: string;
}
