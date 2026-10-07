import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsDateString,
} from 'class-validator';
import { FamilyRelation } from '@prisma/client';

export class CreateFamilyMemberDto {
  @ApiProperty({
    example: 'Ayesha Rahman',
    description: 'Full name of dependent family member',
  })
  @IsNotEmpty()
  @IsString()
  fullName!: string;

  @ApiProperty({
    enum: FamilyRelation,
    example: FamilyRelation.PARENT,
    description:
      'Relationship to primary account holder: PARENT, SPOUSE, CHILD',
  })
  @IsNotEmpty()
  @IsEnum(FamilyRelation)
  relation!: FamilyRelation;

  @ApiPropertyOptional({
    example: '1965-05-14T00:00:00.000Z',
    description: 'Date of birth',
  })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional({
    example: 'FEMALE',
    description: 'Gender of family member',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    example: 'B+',
    description: 'Blood group',
  })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({
    example: ['Penicillin', 'Dust'],
    description: 'Medical allergies',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];
}
