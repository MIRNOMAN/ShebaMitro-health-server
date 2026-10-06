import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsArray, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateLabOrderDto {
  @ApiProperty({ description: 'ID of the selected Diagnostic Lab Profile' })
  @IsNotEmpty()
  @IsUUID()
  labId!: string;

  @ApiPropertyOptional({ description: 'Optional Prescription ID linking this lab order' })
  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

  @ApiProperty({
    example: ['Complete Blood Count (CBC)', 'Fasting Blood Sugar (FBS)'],
    description: 'List of lab test names to book for home collection',
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  testNames!: string[];

  @ApiProperty({
    example: 'House 42, Road 11, Banani, Dhaka',
    description: 'Patient home address for phlebotomist sample collection',
  })
  @IsNotEmpty()
  @IsString()
  sampleCollectionAddress!: string;

  @ApiProperty({
    example: '2026-10-10T08:00:00.000Z',
    description: 'Scheduled slot for home sample collection',
  })
  @IsNotEmpty()
  @IsDateString()
  sampleCollectionSlot!: string;

  @ApiPropertyOptional({ description: 'Additional instructions for sample collection' })
  @IsOptional()
  @IsString()
  notes?: string;
}
