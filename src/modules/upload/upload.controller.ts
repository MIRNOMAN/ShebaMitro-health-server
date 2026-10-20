import {
  Controller,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UploadService } from './upload.service.js';
import {
  UpdateSingleImageDto,
  UpdateMultipleImagesDto,
} from './dto/update-image.dto.js';
import { DeleteImageDto } from './dto/delete-image.dto.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Upload')
@ApiBearerAuth('BearerAuth')
@Public()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * 1. Single Image Upload
   * POST /api/v1/upload/single
   */
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a single image' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ResponseMessage('Image uploaded successfully')
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file uploaded');
    }
    return this.uploadService.uploadSingle(file);
  }

  /**
   * 2. Multiple Images Upload
   * POST /api/v1/upload/multiple
   */
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload multiple images (up to 10)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['files'],
    },
  })
  @ResponseMessage('Images uploaded successfully')
  async uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image files uploaded');
    }
    return this.uploadService.uploadMultiple(files);
  }

  /**
   * 3. Single Image Update / Replace
   * PUT /api/v1/upload/single
   */
  @Put('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update/replace a single image and delete the previous file',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        oldUrl: {
          type: 'string',
        },
        oldFilename: {
          type: 'string',
        },
      },
      required: ['file'],
    },
  })
  @ResponseMessage('Image updated successfully')
  async updateSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateSingleImageDto,
  ) {
    if (!file) {
      throw new BadRequestException('No image file uploaded');
    }
    return this.uploadService.updateSingle(file, dto.oldUrl || dto.oldFilename);
  }

  @Patch('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update/replace a single image (PATCH alias)',
  })
  @ResponseMessage('Image updated successfully')
  async patchSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateSingleImageDto,
  ) {
    return this.updateSingle(file, dto);
  }

  /**
   * 4. Multiple Images Update / Replace
   * PUT /api/v1/upload/multiple
   */
  @Put('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update/replace multiple images and delete the previous files',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        oldUrls: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
        },
        oldFilenames: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
        },
      },
      required: ['files'],
    },
  })
  @ResponseMessage('Images updated successfully')
  async updateMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UpdateMultipleImagesDto,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image files uploaded');
    }
    const oldList: string[] = [];
    if (dto.oldUrls) {
      if (Array.isArray(dto.oldUrls)) {
        oldList.push(...dto.oldUrls);
      } else if (typeof dto.oldUrls === 'string') {
        oldList.push(...dto.oldUrls.split(',').map((s) => s.trim()));
      }
    }
    if (dto.oldFilenames) {
      if (Array.isArray(dto.oldFilenames)) {
        oldList.push(...dto.oldFilenames);
      } else if (typeof dto.oldFilenames === 'string') {
        oldList.push(...dto.oldFilenames.split(',').map((s) => s.trim()));
      }
    }

    return this.uploadService.updateMultiple(files, oldList);
  }

  @Patch('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update/replace multiple images (PATCH alias)',
  })
  @ResponseMessage('Images updated successfully')
  async patchMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UpdateMultipleImagesDto,
  ) {
    return this.updateMultiple(files, dto);
  }

  /**
   * 5. Multiple Images Delete
   * DELETE /api/v1/upload/multiple
   */
  @Delete('multiple')
  @ApiOperation({ summary: 'Delete multiple images by URLs or filenames' })
  @ResponseMessage('Images deleted successfully')
  async deleteMultiple(@Body() dto: DeleteImageDto) {
    const toDelete: string[] = [];
    if (dto.urls) {
      if (Array.isArray(dto.urls)) toDelete.push(...dto.urls);
      else toDelete.push(...dto.urls.split(',').map((s) => s.trim()));
    }
    if (dto.filenames) {
      if (Array.isArray(dto.filenames)) toDelete.push(...dto.filenames);
      else toDelete.push(...dto.filenames.split(',').map((s) => s.trim()));
    }
    if (toDelete.length === 0) {
      if (dto.url) toDelete.push(dto.url);
      if (dto.filename) toDelete.push(dto.filename);
    }
    if (toDelete.length === 0) {
      throw new BadRequestException(
        'Please provide urls or filenames to delete',
      );
    }
    return this.uploadService.deleteMultipleFiles(toDelete);
  }

  /**
   * 6. Delete Image via Query / Body
   * DELETE /api/v1/upload
   */
  @Delete()
  @ApiOperation({
    summary: 'Delete image by URL or filename in request body or query',
  })
  @ResponseMessage('Image deleted successfully')
  async deleteImage(
    @Body() bodyDto: DeleteImageDto,
    @Query() queryDto: DeleteImageDto,
  ) {
    const target =
      bodyDto?.url || bodyDto?.filename || queryDto?.url || queryDto?.filename;

    if (!target) {
      if (
        bodyDto?.urls ||
        bodyDto?.filenames ||
        queryDto?.urls ||
        queryDto?.filenames
      ) {
        return this.deleteMultiple({ ...queryDto, ...bodyDto });
      }
      throw new BadRequestException(
        'Please provide a url or filename to delete',
      );
    }

    return this.uploadService.deleteFile(target);
  }

  /**
   * 7. Delete Image by Filename Parameter
   * DELETE /api/v1/upload/:filename
   */
  @Delete(':filename')
  @ApiOperation({ summary: 'Delete an image by filename parameter' })
  @ResponseMessage('Image deleted successfully')
  async deleteByFilename(@Param('filename') filename: string) {
    if (!filename) {
      throw new BadRequestException('Filename parameter is required');
    }
    return this.uploadService.deleteFile(filename);
  }
}
