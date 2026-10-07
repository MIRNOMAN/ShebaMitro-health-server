import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreatePharmacyOrderDto {
  @ApiProperty({ description: 'ID of the verified Prescription' })
  @IsNotEmpty()
  @IsUUID()
  prescriptionId!: string;

  @ApiProperty({ description: 'ID of the target Pharmacy Profile' })
  @IsNotEmpty()
  @IsUUID()
  pharmacyId!: string;

  @ApiProperty({
    example: 'House 12, Road 5, Dhanmondi, Dhaka',
    description: 'Patient shipping address for medicine order delivery',
  })
  @IsNotEmpty()
  @IsString()
  shippingAddress!: string;

  @ApiPropertyOptional({
    example: ['item-uuid-1', 'item-uuid-2'],
    description:
      'Optional array of specific prescription item IDs to order. If omitted, orders all items.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItemIds?: string[];

  @ApiPropertyOptional({ description: 'Delivery instructions or notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
