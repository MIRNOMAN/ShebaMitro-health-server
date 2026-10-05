import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum PaginationDirection {
  FORWARD = 'forward',
  BACKWARD = 'backward',
}

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Base64 encoded composite cursor [createdAt, id]',
    example: 'WyIyMDI2LTEwLTA1VDE2OjAwOjAwLjAwMFoiLCJ1dWlkLTEyMyJd',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 10, description: 'Number of items to fetch per page' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({
    enum: PaginationDirection,
    default: PaginationDirection.FORWARD,
    description: 'Pagination direction',
  })
  @IsOptional()
  @IsEnum(PaginationDirection)
  direction: PaginationDirection = PaginationDirection.FORWARD;
}
