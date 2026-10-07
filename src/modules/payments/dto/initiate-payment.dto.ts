import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderType, PaymentGateway } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({
    enum: OrderType,
    example: OrderType.APPOINTMENT,
    description: 'Type of order: APPOINTMENT, LAB_ORDER, or PHARMACY_ORDER',
  })
  @IsNotEmpty()
  @IsEnum(OrderType)
  orderType!: OrderType;

  @ApiProperty({
    example: 'd3b07384-d113-40e4-a123-123456789abc',
    description:
      'Target order ID (Appointment ID, LabOrder ID, or PharmacyOrder ID)',
  })
  @IsNotEmpty()
  @IsString()
  orderId!: string;

  @ApiProperty({
    enum: PaymentGateway,
    example: PaymentGateway.BKASH,
    description: 'Payment gateway provider: BKASH or STRIPE',
  })
  @IsNotEmpty()
  @IsEnum(PaymentGateway)
  paymentGateway!: PaymentGateway;

  @ApiPropertyOptional({
    example: 'idempotency-key-uuid-123456',
    description:
      'Unique idempotency key to prevent duplicate payment initiation',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
