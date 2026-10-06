import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service.js';
import { ChatGateway } from './chat.gateway.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { CursorPaginationDto } from '../../common/pagination/dto/cursor-pagination.dto.js';
import { UploadAttachmentDto } from './dto/upload-attachment.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly s3Service: S3Service,
  ) {}

  @Get(':appointmentId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated conversation messages for an appointment using cursor engine',
  })
  @ResponseMessage('Messages fetched successfully')
  async getMessages(
    @Param('appointmentId') appointmentId: string,
    @Query() cursorDto: CursorPaginationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getPaginatedMessages(userId, appointmentId, cursorDto);
  }

  @Post(':appointmentId/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload patient scan or doctor report attachment to S3 and broadcast over WebSocket room',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Patient scan or doctor report file' },
        note: { type: 'string', description: 'Optional text note accompanying the file' },
      },
    },
  })
  @ResponseMessage('Attachment uploaded successfully')
  async uploadAttachment(
    @Param('appointmentId') appointmentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAttachmentDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file attachment uploaded in request');
    }

    // 1. Validate assigned doctor/patient room access
    const { isAssignedDoctor } = await this.chatService.validateAppointmentAccess(
      userId,
      appointmentId,
    );

    const fileTypeLabel = isAssignedDoctor ? 'Doctor Report' : 'Patient Scan';

    // 2. Upload file to S3 and generate 7-day presigned URL
    const uploadResult = await this.s3Service.uploadAttachment(file, appointmentId);

    // 3. Save message record in Message database table
    const content = dto?.note || `[${fileTypeLabel}: ${uploadResult.originalName}]`;
    const message = await this.chatService.saveMessage(
      userId,
      appointmentId,
      content,
      uploadResult.presignedUrl,
    );

    const messageWithMeta = {
      ...message,
      attachment: {
        ...uploadResult,
        type: fileTypeLabel,
      },
    };

    // 4. Broadcast file metadata message over WebSocket room
    this.chatGateway.broadcastNewMessage(appointmentId, messageWithMeta);

    return messageWithMeta;
  }

  @Put(':appointmentId/read-receipts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all unread messages for an appointment as read',
  })
  @ResponseMessage('Read receipts updated successfully')
  async markReadReceipts(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.chatService.markRoomReadReceipts(userId, appointmentId);

    // Broadcast read receipts event over WebSocket room
    this.chatGateway.broadcastReadReceipts(appointmentId, userId, result.count);

    return result;
  }
}
