import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Registered user email address',
    example: 'patient@shebamitro.health',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: '6-digit verification code sent to email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Registered user email address',
    example: 'patient@shebamitro.health',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
