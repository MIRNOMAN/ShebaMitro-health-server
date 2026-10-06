import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ReminderStatus } from '@prisma/client';

export class AcknowledgeReminderDto {
  @ApiProperty({
    enum: [ReminderStatus.TAKEN, ReminderStatus.SKIPPED],
    example: ReminderStatus.TAKEN,
    description: 'Record dosage intake status: TAKEN or SKIPPED',
  })
  @IsNotEmpty()
  @IsEnum(ReminderStatus, {
    message: 'status must be either TAKEN or SKIPPED',
  })
  status!: ReminderStatus;
}
