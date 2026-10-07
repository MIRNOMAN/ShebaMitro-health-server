import {
  IsNotEmpty,
  IsUUID,
  IsString,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CallStateDto {
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CallTelemetryPingDto {
  @IsNotEmpty()
  @IsUUID()
  appointmentId!: string;

  @IsOptional()
  @IsNumber()
  currentDurationSeconds?: number;
}
