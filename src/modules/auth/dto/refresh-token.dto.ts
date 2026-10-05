import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Optional refresh token if not sent in HttpOnly cookie' })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
