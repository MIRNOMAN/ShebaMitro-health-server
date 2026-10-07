import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatGateway } from './chat.gateway.js';
import { S3Service } from '../../common/storage/s3.service.js';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: any;
  let chatGateway: any;
  let s3Service: any;

  const mockFile = {
    originalname: 'blood_report.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('dummy-pdf'),
    size: 1024,
  } as Express.Multer.File;

  beforeEach(async () => {
    chatService = {
      validateAppointmentAccess: jest.fn().mockResolvedValue({
        isAssignedDoctor: false,
        isAssignedPatient: true,
      }),
      getPaginatedMessages: jest.fn().mockResolvedValue({
        data: [],
        pageInfo: { hasNextPage: false },
      }),
      saveMessage: jest.fn().mockResolvedValue({
        id: 'msg-att-1',
        appointmentId: 'appt-123',
        senderId: 'user-patient-1',
        content: '[Patient Scan: blood_report.pdf]',
        fileUrl: 'https://s3.amazonaws.com/presigned-url',
        createdAt: new Date().toISOString(),
      }),
      markRoomReadReceipts: jest.fn().mockResolvedValue({
        count: 5,
        appointmentId: 'appt-123',
        readByUserId: 'user-patient-1',
      }),
    };

    chatGateway = {
      broadcastNewMessage: jest.fn(),
      broadcastReadReceipts: jest.fn(),
    };

    s3Service = {
      uploadAttachment: jest.fn().mockResolvedValue({
        key: 'chat/appointments/appt-123/blood_report.pdf',
        originalName: 'blood_report.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        fileUrl: 'https://s3.amazonaws.com/presigned-url',
        presignedUrl: 'https://s3.amazonaws.com/presigned-url',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: ChatGateway, useValue: chatGateway },
        { provide: S3Service, useValue: s3Service },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /api/v1/chat/:appointmentId/messages', () => {
    it('should call getPaginatedMessages with cursorDto', async () => {
      const cursorDto = { limit: 10, direction: 'forward' as any };

      const result = await controller.getMessages(
        'appt-123',
        cursorDto,
        'user-patient-1',
      );

      expect(chatService.getPaginatedMessages).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
        cursorDto,
      );
      expect(result).toBeDefined();
    });
  });

  describe('POST /api/v1/chat/:appointmentId/attachments', () => {
    it('should upload attachment to S3, persist message, and broadcast to WebSocket room', async () => {
      const result = await controller.uploadAttachment(
        'appt-123',
        mockFile,
        { note: 'Blood test report' },
        'user-patient-1',
      );

      expect(chatService.validateAppointmentAccess).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(s3Service.uploadAttachment).toHaveBeenCalledWith(
        mockFile,
        'appt-123',
      );
      expect(chatService.saveMessage).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
        'Blood test report',
        'https://s3.amazonaws.com/presigned-url',
      );
      expect(chatGateway.broadcastNewMessage).toHaveBeenCalledWith(
        'appt-123',
        expect.objectContaining({ id: 'msg-att-1' }),
      );

      expect(result.id).toBe('msg-att-1');
    });

    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        controller.uploadAttachment(
          'appt-123',
          null as any,
          {},
          'user-patient-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PUT /api/v1/chat/:appointmentId/read-receipts', () => {
    it('should mark messages as read and broadcast read-receipts over WebSocket room', async () => {
      const result = await controller.markReadReceipts(
        'appt-123',
        'user-patient-1',
      );

      expect(chatService.markRoomReadReceipts).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(chatGateway.broadcastReadReceipts).toHaveBeenCalledWith(
        'appt-123',
        'user-patient-1',
        5,
      );
      expect(result.count).toBe(5);
    });
  });
});
