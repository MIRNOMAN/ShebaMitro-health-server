import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export enum LabReportTestType {
  CBC = 'CBC',
  LIPID = 'LIPID',
  HBA1C = 'HBA1C',
  GENERAL = 'GENERAL',
}

export class UploadReportScanDto {
  @ApiPropertyOptional({
    description: 'Patient Profile ID or User ID (optional if uploaded by authenticated patient)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({
    enum: LabReportTestType,
    example: LabReportTestType.CBC,
    description: 'Lab test type category: CBC, LIPID, HBA1C, or GENERAL',
  })
  @IsNotEmpty()
  @IsEnum(LabReportTestType)
  testType!: LabReportTestType;

  @ApiPropertyOptional({
    example: 'https://shebamitro-bucket.s3.us-east-1.amazonaws.com/lab-scans/cbc-report.pdf',
    description: 'Scan image / PDF file URL',
  })
  @IsOptional()
  @IsString()
  scanFileUrl?: string;

  @ApiPropertyOptional({
    example: 'Hemoglobin: 13.5 g/dL, WBC: 7.2 10^3/uL, Platelets: 250 10^3/uL',
    description: 'Raw document text (if pre-extracted or directly provided)',
  })
  @IsOptional()
  @IsString()
  rawText?: string;

  @ApiPropertyOptional({
    example: '2026-10-07T00:00:00.000Z',
    description: 'Date lab test was performed',
  })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}
