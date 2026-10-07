import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SinglePayoutDto {
  @ApiProperty({
    description: 'ID of the provider (Doctor or Lab)',
    example: 'doc-uuid-123',
  })
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @ApiProperty({
    description: 'Type of provider (DOCTOR, LAB, PHARMACY)',
    example: 'DOCTOR',
  })
  @IsString()
  @IsNotEmpty()
  providerType!: string;

  @ApiProperty({
    description: 'Payout disbursement amount in BDT',
    example: 5000.0,
  })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({
    description: 'Payment method (BANK, BKASH, NAGAD)',
    example: 'BKASH',
  })
  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @ApiProperty({
    description:
      'Account details object containing phone/account number, bank name, branch info',
    example: {
      accountNumber: '01700000000',
      accountHolderName: 'Dr. John Doe',
    },
  })
  @IsObject()
  @IsNotEmpty()
  accountDetails!: Record<string, any>;
}

export class ExecutePayoutsDto {
  @ApiProperty({
    type: [SinglePayoutDto],
    description: 'List of payout items to disburse',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SinglePayoutDto)
  payouts!: SinglePayoutDto[];
}
