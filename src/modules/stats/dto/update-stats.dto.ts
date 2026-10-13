import { IsOptional, IsNumber, IsString, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStatCounterDto {
  @ApiPropertyOptional({ example: 'consultations' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsNumber()
  value!: number;

  @ApiPropertyOptional({ example: '+' })
  @IsOptional()
  @IsString()
  suffix?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  decimals?: number;

  @ApiPropertyOptional({ example: 'Completed Consultations' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'Across 64 districts in Bangladesh' })
  @IsOptional()
  @IsString()
  subtext?: string;
}

export class CreateLiveActivityDto {
  @ApiPropertyOptional({ example: 'Dr. Farah Ahmed completed a live video consultation in Dhaka • 14s ago' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ example: 'ডাঃ ফারাহ আহমেদ ঢাকা থেকে লাইভ ভিডিও কনসালটেশন সম্পন্ন করেছেন • ১৪ সে পূর্বে' })
  @IsOptional()
  @IsString()
  messageBn?: string;

  @ApiPropertyOptional({ example: 'Dr. Farah Ahmed' })
  @IsOptional()
  @IsString()
  doctorName?: string;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'completed a live video consultation' })
  @IsOptional()
  @IsString()
  action?: string;
}

export class UpdateStatsDto {
  @ApiPropertyOptional({ type: [UpdateStatCounterDto] })
  @IsOptional()
  @IsArray()
  counters?: UpdateStatCounterDto[];

  @ApiPropertyOptional({ type: CreateLiveActivityDto })
  @IsOptional()
  newActivity?: CreateLiveActivityDto;
}
