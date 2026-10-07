import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryBiomarkersDto {
  @ApiPropertyOptional({
    example: 'hba1c',
    description:
      'Filter by biomarker key (e.g. hba1c, cholesterol, hdl, ldl, triglycerides, hemoglobin, wbc, platelets)',
  })
  @IsOptional()
  @IsString()
  marker?: string;

  @ApiPropertyOptional({
    example: 'CBC',
    description: 'Filter by lab test type (e.g. CBC, LIPID, HBA1C)',
  })
  @IsOptional()
  @IsString()
  testType?: string;

  @ApiPropertyOptional({
    default: 50,
    description: 'Max number of data points',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;
}
