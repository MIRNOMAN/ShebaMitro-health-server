import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ example: '+8801700000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'strongP@ss1' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.PATIENT })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}
