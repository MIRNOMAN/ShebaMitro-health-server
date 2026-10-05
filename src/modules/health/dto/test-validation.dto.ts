import { IsString, IsNotEmpty, IsNumber, IsEmail, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestValidationDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 25 })
  @IsNumber()
  @Min(18)
  age!: number;
}
