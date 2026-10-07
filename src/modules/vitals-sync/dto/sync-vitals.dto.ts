import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVitalDto } from './create-vital.dto.js';

export class SyncVitalsDto {
  @ApiPropertyOptional({
    example: 'batch-key-998877',
    description:
      'Batch-level idempotency key to prevent duplicate bulk ingestion',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({
    type: [CreateVitalDto],
    description: 'Array of biometric vital readings for bulk ingestion',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVitalDto)
  vitals!: CreateVitalDto[];
}
