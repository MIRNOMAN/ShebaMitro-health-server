import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'patient@shebamitro.health',
    description: 'Registered Email address or Phone number',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or Phone identifier is required' })
  identifier!: string;
}
