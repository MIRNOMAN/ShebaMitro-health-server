import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class FilterLabTestsDto {
  @ApiPropertyOptional({
    description:
      'Full-text search query across test name, description, category, or lab name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Category filter (e.g. Hematology, Biochemistry, Radiology, Microbiology)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by fasting requirement (true/false)',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  fastingRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum turnaround time in hours (e.g. 24)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  turnaroundTime?: number;

  @ApiPropertyOptional({ description: 'Minimum test price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum test price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Lab accreditation filter (e.g. ISO15189, CAP, NABL)',
  })
  @IsOptional()
  @IsString()
  labAccreditation?: string;

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
