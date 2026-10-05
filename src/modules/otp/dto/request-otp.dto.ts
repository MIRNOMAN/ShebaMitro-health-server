import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: '+8801700000000', description: 'Phone number' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone!: string;
}
