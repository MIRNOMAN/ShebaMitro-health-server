import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EhrRecordType {
  PRESCRIPTION = 'PRESCRIPTION',
  LAB_REPORT = 'LAB_REPORT',
  CLINICAL_NOTE = 'CLINICAL_NOTE',
}

export class FilterEhrDto {
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Start date range filter',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.000Z',
    description: 'End date range filter',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: EhrRecordType,
    example: EhrRecordType.PRESCRIPTION,
    description:
      'Filter by record type: PRESCRIPTION, LAB_REPORT, or CLINICAL_NOTE',
  })
  @IsOptional()
  @IsEnum(EhrRecordType)
  recordType?: EhrRecordType;

  @ApiPropertyOptional({
    example: 'Cardiology',
    description:
      'Filter by doctor specialization (e.g. Cardiology, Pulmonology, General Medicine)',
  })
  @IsOptional()
  @IsString()
  doctorSpecialty?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}
