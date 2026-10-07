import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: '+8801700000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: Role, default: Role.PATIENT })
  @IsEnum(Role, { message: 'Invalid user role' })
  @IsOptional()
  role?: Role;
}
