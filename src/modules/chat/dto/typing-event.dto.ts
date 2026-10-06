import { IsNotEmpty, IsUUID } from 'class-validator';

export class TypingEventDto {
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;
}
