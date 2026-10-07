import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  TeleconsultGateway,
  AuthenticatedSocket,
} from './teleconsult.gateway.js';

describe('TeleconsultGateway', () => {
  let gateway: TeleconsultGateway;
  let jwtService: any;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(async () => {
    jwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-doc-1',
        email: 'doctor@example.com',
        role: 'DOCTOR',
      }),
    };

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockSocket = {
      id: 'socket-tc-1',
      handshake: {
        headers: { authorization: 'Bearer test-jwt-token' },
        auth: {},
        query: {},
      },
      data: {
        user: { id: 'user-doc-1', email: 'doctor@example.com', role: 'DOCTOR' },
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeleconsultGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'JWT_SECRET') return 'test-secret';
              return defaultValue;
            }),
          },
        },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    gateway = module.get<TeleconsultGateway>(TeleconsultGateway);
    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate teleconsult socket via JWT handshake', async () => {
      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('test-jwt-token', {
        secret: 'test-secret',
      });
      expect(mockSocket.data.user.id).toBe('user-doc-1');
    });
  });

  describe('handleCallJoin', () => {
    it('should join teleconsult room, emit CONNECTED call state & live duration telemetry', async () => {
      const payload = { appointmentId: 'appt-tele-1' };

      const result = await gateway.handleCallJoin(mockSocket, payload);

      expect(mockSocket.join).toHaveBeenCalledWith('teleconsult_appt-tele-1');
      expect(mockServer.to).toHaveBeenCalledWith('teleconsult_appt-tele-1');
      expect(mockServer.emit).toHaveBeenCalledWith('call-state-changed', {
        appointmentId: 'appt-tele-1',
        userId: 'user-doc-1',
        state: 'CONNECTED',
        timestamp: expect.any(String),
      });
      expect(mockServer.emit).toHaveBeenCalledWith(
        'call-telemetry',
        expect.objectContaining({
          appointmentId: 'appt-tele-1',
          activeParticipantCount: 1,
        }),
      );

      expect(result.data.state).toBe('CONNECTED');
    });
  });

  describe('handleCallReconnect', () => {
    it('should emit RECONNECTED state transition event and telemetry', async () => {
      const payload = { appointmentId: 'appt-tele-1' };

      const result = await gateway.handleCallReconnect(mockSocket, payload);

      expect(mockServer.emit).toHaveBeenCalledWith('call-state-changed', {
        appointmentId: 'appt-tele-1',
        userId: 'user-doc-1',
        state: 'RECONNECTED',
        timestamp: expect.any(String),
      });
      expect(result.data.state).toBe('RECONNECTED');
    });
  });

  describe('handleCallDisconnect', () => {
    it('should leave teleconsult room, emit DISCONNECTED state transition and telemetry', async () => {
      const payload = {
        appointmentId: 'appt-tele-1',
        reason: 'User completed call',
      };

      const result = await gateway.handleCallDisconnect(mockSocket, payload);

      expect(mockSocket.leave).toHaveBeenCalledWith('teleconsult_appt-tele-1');
      expect(mockServer.emit).toHaveBeenCalledWith('call-state-changed', {
        appointmentId: 'appt-tele-1',
        userId: 'user-doc-1',
        state: 'DISCONNECTED',
        reason: 'User completed call',
        timestamp: expect.any(String),
      });
      expect(result.data.state).toBe('DISCONNECTED');
    });
  });
});
