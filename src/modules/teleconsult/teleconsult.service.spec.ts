import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TeleconsultService } from './teleconsult.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('TeleconsultService', () => {
  let service: TeleconsultService;
  let prismaService: any;

  const now = Date.now();
  const slotStart = new Date(now + 5 * 60 * 1000); // 5 minutes in the future (within +-15m)
  const slotEnd = new Date(now + 35 * 60 * 1000);

  const mockAppointment = {
    id: 'appt-tele-1',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    slotStartTime: slotStart,
    slotEndTime: slotEnd,
    doctor: { id: 'doc-profile-1', userId: 'user-doc-1' },
    patient: { id: 'patient-profile-1', userId: 'user-patient-1' },
  };

  const mockDoctorUser = { id: 'user-doc-1', role: Role.DOCTOR, deletedAt: null };
  const mockPatientUser = { id: 'user-patient-1', role: Role.PATIENT, deletedAt: null };
  const mockAdminUser = { id: 'user-admin-1', role: Role.ADMIN, deletedAt: null };
  const mockUnrelatedUser = { id: 'user-unrelated-99', role: Role.PATIENT, deletedAt: null };

  beforeEach(async () => {
    prismaService = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(mockAppointment),
      },
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === 'user-doc-1') return mockDoctorUser;
          if (where.id === 'user-patient-1') return mockPatientUser;
          if (where.id === 'user-admin-1') return mockAdminUser;
          if (where.id === 'user-unrelated-99') return mockUnrelatedUser;
          return null;
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeleconsultService,
        { provide: PrismaService, useValue: prismaService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'AGORA_APP_ID') return 'test-agora-app-id';
              if (key === 'AGORA_APP_CERTIFICATE') return 'test-agora-app-certificate';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TeleconsultService>(TeleconsultService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRtcToken', () => {
    it('should generate PUBLISHER RTC token for assigned doctor within +-15m window', async () => {
      const result = await service.generateRtcToken('user-doc-1', 'appt-tele-1');

      expect(result.appointmentId).toBe('appt-tele-1');
      expect(result.channelName).toBe('teleconsult_appt-tele-1');
      expect(result.role).toBe('PUBLISHER');
      expect(result.uid).toBe('user-doc-1');
      expect(result.token).toBeDefined();
    });

    it('should generate PUBLISHER RTC token for assigned patient within +-15m window', async () => {
      const result = await service.generateRtcToken('user-patient-1', 'appt-tele-1');

      expect(result.role).toBe('PUBLISHER');
      expect(result.uid).toBe('user-patient-1');
    });

    it('should generate SUBSCRIBER RTC token for assistant/admin user', async () => {
      const result = await service.generateRtcToken('user-admin-1', 'appt-tele-1');

      expect(result.role).toBe('SUBSCRIBER');
      expect(result.uid).toBe('user-admin-1');
    });

    it('should throw ForbiddenException for unauthorized caller identity', async () => {
      await expect(
        service.generateRtcToken('user-unrelated-99', 'appt-tele-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if current time is outside +-15m window of slot start', async () => {
      const expiredAppointment = {
        ...mockAppointment,
        slotStartTime: new Date(Date.now() - 3 * 3600 * 1000), // 3 hours ago
        slotEndTime: new Date(Date.now() - 2.5 * 3600 * 1000),
      };
      prismaService.appointment.findUnique.mockResolvedValueOnce(expiredAppointment);

      await expect(
        service.generateRtcToken('user-doc-1', 'appt-tele-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if appointment does not exist', async () => {
      prismaService.appointment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.generateRtcToken('user-doc-1', 'invalid-appt-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
