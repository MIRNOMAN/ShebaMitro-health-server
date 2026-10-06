import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadAttachmentDto {
  @ApiPropertyOptional({ description: 'Optional text note accompanying the attachment' })
  @IsOptional()
  @IsString()
  note?: string;
}
