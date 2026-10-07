import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class VerifyProviderDto {
  @ApiProperty({
    description: 'Approval decision: true for approved, false for rejected',
    example: true,
  })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({
    description: 'Reason for rejection if approved is false',
    example: 'Invalid BMDC license document',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({
    description: 'Internal admin notes or audit remarks',
    example: 'Verified against BMDC registry portal',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
