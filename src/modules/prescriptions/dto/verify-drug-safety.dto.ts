import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescribedMedicationInputDto {
  @ApiProperty({ example: 'Warfarin', description: 'Name of the medicine' })
  @IsNotEmpty()
  @IsString()
  medicineName!: string;

  @ApiPropertyOptional({ example: 'Coumadin', description: 'Generic composition or brand' })
  @IsOptional()
  @IsString()
  genericName?: string;
}

export class VerifyDrugSafetyDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Appointment ID' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174001', description: 'Patient Profile ID' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiProperty({ type: [PrescribedMedicationInputDto], description: 'List of prescribed medications to verify' })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescribedMedicationInputDto)
  medicines!: PrescribedMedicationInputDto[];
}
