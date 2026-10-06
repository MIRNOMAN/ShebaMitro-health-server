import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsIn } from 'class-validator';

export class SnoozeReminderDto {
  @ApiPropertyOptional({
    example: 15,
    description: 'Snooze delay in minutes (15 or 30 mins). Default is 15 mins.',
  })
  @IsOptional()
  @IsInt()
  @IsIn([15, 30], {
    message: 'snooze minutes must be either 15 or 30',
  })
  minutes?: number = 15;
}
