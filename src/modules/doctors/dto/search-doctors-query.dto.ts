import { IsOptional, IsString, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchDoctorsQueryDto {
  @ApiPropertyOptional({ description: 'Search term for doctor name, bio, or hospital' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by specialty (array or string)', type: [String] })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    return value;
  })
  @IsString({ each: true })
  specialty?: string[];

  @ApiPropertyOptional({ description: 'Minimum consultation fee' })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  minFee?: number;

  @ApiPropertyOptional({ description: 'Maximum consultation fee' })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  maxFee?: number;

  @ApiPropertyOptional({ description: 'Minimum rating threshold (e.g. 4.5)' })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingThreshold?: number;

  @ApiPropertyOptional({ description: 'Gender filter (e.g., MALE, FEMALE)' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Filter doctors available today (true/false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  availableToday?: boolean;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
