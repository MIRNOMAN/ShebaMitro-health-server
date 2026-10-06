import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
