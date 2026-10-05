import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+8801700000000', description: 'Phone number' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone!: string;

  @ApiProperty({ example: '123456', description: '6-digit numeric OTP' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @IsNotEmpty({ message: 'OTP is required' })
  code!: string;
}
