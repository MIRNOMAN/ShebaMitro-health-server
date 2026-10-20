import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CartItemDto {
  @ApiProperty({ description: 'Database ID of the medicine' })
  @IsNotEmpty()
  @IsString()
  medicineId!: string;

  @ApiProperty({ description: 'Quantity requested', default: 1 })
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Name of the medicine' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Unit price' })
  @IsOptional()
  @IsNumber()
  price?: number;
}

export class CheckoutCartDto {
  @ApiProperty({ description: 'List of cart items', type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiProperty({
    example: 'House 14, Road 8, Dhanmondi, Dhaka',
    description: 'Patient shipping address for medicine delivery',
  })
  @IsNotEmpty()
  @IsString()
  shippingAddress!: string;

  @ApiPropertyOptional({
    description: 'Payment method chosen: COD, BKASH, or CARD',
    default: 'COD',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'Whether customer selected Express 2-Hour Delivery',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isExpressDelivery?: boolean;

  @ApiPropertyOptional({
    description: 'Optional prescription image URL if prescription was attached',
  })
  @IsOptional()
  @IsString()
  prescriptionImageUrl?: string;

  @ApiPropertyOptional({ description: 'Optional special delivery instructions or notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Customer contact phone number' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Customer full name' })
  @IsOptional()
  @IsString()
  customerName?: string;
}
