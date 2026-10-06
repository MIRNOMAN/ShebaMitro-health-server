import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { ChatGateway, AuthenticatedSocket } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: any;
  let jwtService: any;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(async () => {
    chatService = {
      validateAppointmentAccess: jest.fn().mockResolvedValue({
        isAssignedDoctor: false,
        isAssignedPatient: true,
      }),
      saveMessage: jest.fn().mockResolvedValue({
        id: 'msg-123',
        appointmentId: 'appt-123',
        senderId: 'user-patient-1',
        content: 'Hello doctor',
        createdAt: new Date().toISOString(),
      }),
      markMessageDelivered: jest.fn().mockResolvedValue({
        id: 'msg-123',
        appointmentId: 'appt-123',
        isRead: true,
        updatedAt: new Date().toISOString(),
      }),
      getRoomMessages: jest.fn().mockResolvedValue([]),
    };

    jwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-patient-1',
        email: 'patient@example.com',
        role: 'PATIENT',
      }),
    };

    mockServer = {
      adapter: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockSocket = {
      id: 'socket-1',
      handshake: {
        headers: { authorization: 'Bearer test-jwt-token' },
        auth: {},
        query: {},
      },
      data: {
        user: { id: 'user-patient-1', email: 'patient@example.com', role: 'PATIENT' },
      },
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      disconnect: jest.fn(),
    } as unknown as AuthenticatedSocket;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'JWT_SECRET') return 'test-secret';
              if (key === 'REDIS_HOST') return '127.0.0.1';
              if (key === 'REDIS_PORT') return 6379;
              return defaultValue;
            }),
          },
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ChatService, useValue: chatService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate connection handshake via JWT and attach user data', async () => {
      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('test-jwt-token', {
        secret: 'test-secret',
      });
      expect(mockSocket.data.user.id).toBe('user-patient-1');
    });

    it('should disconnect socket if JWT token is invalid or missing', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized socket connection',
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoinRoom', () => {
    it('should validate access and join room:appointment:{id}', async () => {
      const payload = { appointmentId: 'appt-123' };

      await gateway.handleJoinRoom(mockSocket, payload);

      expect(chatService.validateAppointmentAccess).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(mockSocket.join).toHaveBeenCalledWith('room:appointment:appt-123');
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'room-joined',
        expect.objectContaining({
          appointmentId: 'appt-123',
          room: 'room:appointment:appt-123',
        }),
      );
    });
  });

  describe('handleSendMessage', () => {
    it('should validate access, store message in DB and broadcast to room', async () => {
      const payload = { appointmentId: 'appt-123', content: 'Need medical advice' };

      await gateway.handleSendMessage(mockSocket, payload);

      expect(chatService.validateAppointmentAccess).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(chatService.saveMessage).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
        'Need medical advice',
        undefined,
      );
      expect(mockServer.to).toHaveBeenCalledWith('room:appointment:appt-123');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'new-message',
        expect.objectContaining({ id: 'msg-123' }),
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'message-delivered',
        expect.objectContaining({ messageId: 'msg-123', appointmentId: 'appt-123' }),
      );
    });
  });

  describe('handleTypingStart & handleTypingStop', () => {
    it('should broadcast typing-start to room:appointment:{id}', async () => {
      await gateway.handleTypingStart(mockSocket, { appointmentId: 'appt-123' });

      expect(chatService.validateAppointmentAccess).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(mockSocket.to).toHaveBeenCalledWith('room:appointment:appt-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('typing-start', {
        appointmentId: 'appt-123',
        userId: 'user-patient-1',
      });
    });

    it('should broadcast typing-stop to room:appointment:{id}', async () => {
      await gateway.handleTypingStop(mockSocket, { appointmentId: 'appt-123' });

      expect(chatService.validateAppointmentAccess).toHaveBeenCalledWith(
        'user-patient-1',
        'appt-123',
      );
      expect(mockSocket.to).toHaveBeenCalledWith('room:appointment:appt-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('typing-stop', {
        appointmentId: 'appt-123',
        userId: 'user-patient-1',
      });
    });
  });
});
