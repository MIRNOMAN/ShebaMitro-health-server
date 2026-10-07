import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class RefillOrderDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID of the Prescription to refill',
  })
  @IsNotEmpty()
  @IsUUID()
  prescriptionId!: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174001',
    description:
      'Specific Prescription Item ID to refill. If omitted, refills all eligible chronic items.',
  })
  @IsOptional()
  @IsUUID()
  prescriptionItemId?: string;

  @ApiPropertyOptional({
    example: ['item-uuid-1', 'item-uuid-2'],
    description: 'Optional array of specific prescription item IDs to refill',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItemIds?: string[];

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174002',
    description:
      'Target partner pharmacy ID. If omitted, automatically routes to patient preferred partner pharmacy.',
  })
  @IsOptional()
  @IsUUID()
  pharmacyId?: string;

  @ApiPropertyOptional({
    example: 'House 12, Road 5, Dhanmondi, Dhaka',
    description:
      'Shipping address for delivery. If omitted, auto-resolves from patient profile / previous order history.',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({
    example: 'Please leave at reception',
    description: 'Special delivery instructions or notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
