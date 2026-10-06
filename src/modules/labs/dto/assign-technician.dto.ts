import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max } from 'class-validator';

export class AssignTechnicianDto {
  @ApiProperty({ example: 'Tariqul Islam', description: 'Name of the phlebotomist technician' })
  @IsNotEmpty()
  @IsString()
  technicianName!: string;

  @ApiProperty({ example: '+8801711223344', description: 'Contact phone number of phlebotomist' })
  @IsNotEmpty()
  @IsString()
  technicianPhone!: string;

  @ApiProperty({ example: 23.7937, description: 'Live latitude coordinate of dispatched technician' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 90.4066, description: 'Live longitude coordinate of dispatched technician' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
