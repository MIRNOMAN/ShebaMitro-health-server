import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteImageDto {
  @ApiPropertyOptional({
    description: 'URL of the image to delete',
    example: 'http://localhost:5100/uploads/images/sample.jpg',
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    description: 'Filename of the image to delete',
    example: 'sample.jpg',
  })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({
    description: 'Array or comma-separated list of URLs to delete',
  })
  @IsOptional()
  urls?: string | string[];

  @ApiPropertyOptional({
    description: 'Array or comma-separated list of filenames to delete',
  })
  @IsOptional()
  filenames?: string | string[];
}
