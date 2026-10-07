import { Test, TestingModule } from '@nestjs/testing';
import { Role, FamilyRelation, AppointmentType } from '@prisma/client';
import { FamilyMemberService } from './family-member.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory.js';

describe('FamilyMemberService', () => {
  let service: FamilyMemberService;
  let prisma: any;

  const mockFamilyMember = {
    id: 'family-mem-100',
    primaryUserId: 'user-primary-100',
    fullName: 'Ayesha Rahman',
    relation: FamilyRelation.PARENT,
    dob: new Date('1965-05-14'),
    gender: 'FEMALE',
    bloodGroup: 'B+',
    allergies: ['Penicillin'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDoctor = {
    id: 'doctor-200',
    name: 'Dr. Fatima Khan',
    specialization: 'General Medicine',
  };

  const mockPatientProfile = {
    id: 'patient-profile-100',
    userId: 'user-primary-100',
  };

  const mockAppointment = {
    id: 'appt-300',
    doctorId: 'doctor-200',
    patientId: 'patient-profile-100',
    familyMemberId: 'family-mem-100',
    slotStartTime: new Date('2026-10-10T10:00:00.000Z'),
    slotEndTime: new Date('2026-10-10T10:30:00.000Z'),
    type: AppointmentType.ONLINE,
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    notes: '[Booked for Family Member: Ayesha Rahman (PARENT)]',
  };

  beforeEach(async () => {
    prisma = {
      familyMember: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'family-mem-100',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([mockFamilyMember]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'family-mem-100') {
            return Promise.resolve(mockFamilyMember);
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockFamilyMember, ...data })),
        delete: jest.fn().mockResolvedValue(mockFamilyMember),
      },
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
        create: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      doctorProfile: {
        findUnique: jest.fn().mockResolvedValue(mockDoctor),
      },
      appointment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockAppointment),
      },
      prescription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rx-400',
            familyMemberId: 'family-mem-100',
            diagnosis: 'Hypertension',
            doctor: mockDoctor,
            items: [],
          },
        ]),
      },
      prescriptionItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'item-500', medicineName: 'Napa Extend' }),
      },
      medicineReminder: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'rem-600',
            ...data,
            createdAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rem-600',
            familyMemberId: 'family-mem-100',
            intakeTime: new Date('2026-10-10T08:00:00.000Z'),
            status: 'PENDING',
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FamilyMemberService,
        CaslAbilityFactory,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FamilyMemberService>(FamilyMemberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFamilyMember', () => {
    it('should register dependent family member for primary account holder', async () => {
      const dto = {
        fullName: 'Ayesha Rahman',
        relation: FamilyRelation.PARENT,
        dob: '1965-05-14T00:00:00.000Z',
        gender: 'FEMALE',
        bloodGroup: 'B+',
        allergies: ['Penicillin'],
      };

      const result = await service.createFamilyMember('user-primary-100', Role.PATIENT, dto);

      expect(result.primaryUserId).toBe('user-primary-100');
      expect(result.relation).toBe(FamilyRelation.PARENT);
      expect(prisma.familyMember.create).toHaveBeenCalled();
    });
  });

  describe('bookFamilyAppointment', () => {
    it('should book appointment on behalf of family member using CASL policy', async () => {
      const dto = {
        doctorId: 'doctor-200',
        slotStartTime: '2026-10-10T10:00:00.000Z',
        slotEndTime: '2026-10-10T10:30:00.000Z',
        type: AppointmentType.ONLINE,
      };

      const result = await service.bookFamilyAppointment(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );

      expect(result.familyMemberId).toBe('family-mem-100');
      expect(result.patientId).toBe('patient-profile-100');
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyMemberId: 'family-mem-100',
            doctorId: 'doctor-200',
          }),
        }),
      );
    });
  });

  describe('getFamilyPrescriptions', () => {
    it('should return prescriptions for dependent family member', async () => {
      const result = await service.getFamilyPrescriptions(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
      );

      expect(result.length).toBe(1);
      expect(result[0].diagnosis).toBe('Hypertension');
    });
  });

  describe('createFamilyReminder & getFamilyReminders', () => {
    it('should set independent medicine reminder for family member', async () => {
      const dto = {
        prescriptionItemId: 'item-500',
        intakeTime: '2026-10-10T08:00:00.000Z',
      };

      const reminder = await service.createFamilyReminder(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );

      expect(reminder.familyMemberId).toBe('family-mem-100');
      expect(prisma.medicineReminder.create).toHaveBeenCalled();

      const reminders = await service.getFamilyReminders(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
      );

      expect(reminders.length).toBe(1);
    });
  });
});
