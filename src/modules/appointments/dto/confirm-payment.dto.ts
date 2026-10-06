import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @ApiPropertyOptional({ description: 'Optional transaction or payment ID' })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
