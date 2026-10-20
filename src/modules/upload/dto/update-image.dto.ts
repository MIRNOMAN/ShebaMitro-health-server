import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSingleImageDto {
  @ApiPropertyOptional({
    description: 'URL of the old image to replace and delete',
    example: 'http://localhost:5100/uploads/images/old-file.jpg',
  })
  @IsOptional()
  @IsString()
  oldUrl?: string;

  @ApiPropertyOptional({
    description: 'Old filename to replace and delete',
    example: 'old-file.jpg',
  })
  @IsOptional()
  @IsString()
  oldFilename?: string;
}

export class UpdateMultipleImagesDto {
  @ApiPropertyOptional({
    description:
      'Array or comma-separated list of old URLs to replace and delete',
  })
  @IsOptional()
  oldUrls?: string | string[];

  @ApiPropertyOptional({
    description:
      'Array or comma-separated list of old filenames to replace and delete',
  })
  @IsOptional()
  oldFilenames?: string | string[];
}
