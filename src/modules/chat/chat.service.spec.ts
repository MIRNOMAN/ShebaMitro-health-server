import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PaginationService } from '../../common/pagination/pagination.service.js';

describe('ChatService', () => {
  let service: ChatService;
  let prismaService: any;
  let paginationService: any;

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
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([mockMessage]),
      },
    };

    paginationService = {
      paginate: jest.fn().mockResolvedValue({
        data: [mockMessage],
        pageInfo: {
          startCursor: 'cursor-start',
          endCursor: 'cursor-end',
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('validateAppointmentAccess', () => {
    it('should grant access to assigned doctor', async () => {
      const access = await service.validateAppointmentAccess(
        'user-doctor-1',
        'appt-123',
      );
      expect(access.isAssignedDoctor).toBe(true);
      expect(access.isAssignedPatient).toBe(false);
    });

    it('should grant access to assigned patient', async () => {
      const access = await service.validateAppointmentAccess(
        'user-patient-1',
        'appt-123',
      );
      expect(access.isAssignedPatient).toBe(true);
      expect(access.isAssignedDoctor).toBe(false);
    });

    it('should throw ForbiddenException if user is neither assigned doctor nor patient', async () => {
      await expect(
        service.validateAppointmentAccess('unauthorized-user-999', 'appt-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if appointment does not exist', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.validateAppointmentAccess('user-doctor-1', 'invalid-appt-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPaginatedMessages', () => {
    it('should validate access and call cursor pagination engine', async () => {
      const cursorDto = { limit: 10, direction: 'forward' as any };

      const result = await service.getPaginatedMessages(
        'user-patient-1',
        'appt-123',
        cursorDto,
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        prismaService.message,
        expect.objectContaining({
          where: { appointmentId: 'appt-123' },
          orderByField: 'createdAt',
          sortOrder: 'desc',
        }),
      );

      expect(result.data).toHaveLength(1);
    });
  });

  describe('markRoomReadReceipts', () => {
    it('should mark all messages from other user as read', async () => {
      const result = await service.markRoomReadReceipts(
        'user-patient-1',
        'appt-123',
      );

      expect(prismaService.message.updateMany).toHaveBeenCalledWith({
        where: {
          appointmentId: 'appt-123',
          senderId: { not: 'user-patient-1' },
          isRead: false,
        },
        data: { isRead: true },
      });

      expect(result.count).toBe(3);
    });
  });
});
