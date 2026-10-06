import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { ChatService } from './chat.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('ChatService', () => {
  let service: ChatService;
  let prismaService: any;

  const mockAppointment = {
    id: 'appt-123',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    doctor: { id: 'doc-profile-1', userId: 'user-doctor-1' },
    patient: { id: 'patient-profile-1', userId: 'user-patient-1' },
  };

  const mockMessage = {
    id: 'msg-1',
    appointmentId: 'appt-123',
    senderId: 'user-patient-1',
    content: 'Hello Doctor',
    fileUrl: null,
    isRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: {
      id: 'user-patient-1',
      name: 'John Patient',
      email: 'patient@example.com',
      role: 'PATIENT',
    },
  };

  beforeEach(async () => {
    prismaService = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(mockAppointment),
      },
      message: {
        create: jest.fn().mockResolvedValue(mockMessage),
        findUnique: jest.fn().mockResolvedValue(mockMessage),
        update: jest.fn().mockResolvedValue({ ...mockMessage, isRead: true }),
        findMany: jest.fn().mockResolvedValue([mockMessage]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('validateAppointmentAccess', () => {
    it('should grant access to assigned doctor', async () => {
      const access = await service.validateAppointmentAccess('user-doctor-1', 'appt-123');
      expect(access.isAssignedDoctor).toBe(true);
      expect(access.isAssignedPatient).toBe(false);
    });

    it('should grant access to assigned patient', async () => {
      const access = await service.validateAppointmentAccess('user-patient-1', 'appt-123');
      expect(access.isAssignedPatient).toBe(true);
      expect(access.isAssignedDoctor).toBe(false);
    });

    it('should throw WsException if user is neither assigned doctor nor assigned patient', async () => {
      await expect(
        service.validateAppointmentAccess('unauthorized-user-999', 'appt-123'),
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException if appointment does not exist', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.validateAppointmentAccess('user-doctor-1', 'invalid-appt-id'),
      ).rejects.toThrow(WsException);
    });
  });

  describe('saveMessage', () => {
    it('should store conversation message in Message table', async () => {
      const result = await service.saveMessage(
        'user-patient-1',
        'appt-123',
        'Hello Doctor',
      );

      expect(prismaService.message.create).toHaveBeenCalledWith({
        data: {
          appointmentId: 'appt-123',
          senderId: 'user-patient-1',
          content: 'Hello Doctor',
          fileUrl: null,
          isRead: false,
        },
        include: expect.any(Object),
      });

      expect(result.id).toBe('msg-1');
    });
  });
});
