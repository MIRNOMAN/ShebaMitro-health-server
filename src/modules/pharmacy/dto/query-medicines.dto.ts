import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class QueryMedicinesDto {
  @ApiPropertyOptional({
    description: 'Search query for brand name, generic name, or manufacturer',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Category filter e.g. pain, digestive, diabetic, cardiac, vitamins, antibiotic',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of medicine or generic names to filter by (e.g. from scanned prescription)',
  })
  @IsOptional()
  @IsString()
  names?: string;

  @ApiPropertyOptional({ description: 'Page number', default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Page limit', default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
