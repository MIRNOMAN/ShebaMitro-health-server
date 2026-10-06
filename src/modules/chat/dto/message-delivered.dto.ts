import { IsNotEmpty, IsUUID } from 'class-validator';

export class MessageDeliveredDto {
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;

  @IsNotEmpty()
  @IsUUID()
  messageId!: string;
}
