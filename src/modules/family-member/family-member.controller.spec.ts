import { Test, TestingModule } from '@nestjs/testing';
import { Role, FamilyRelation, AppointmentType } from '@prisma/client';
import { FamilyMemberController } from './family-member.controller.js';
import { FamilyMemberService } from './family-member.service.js';

describe('FamilyMemberController', () => {
  let controller: FamilyMemberController;
  let service: any;

  const mockFamilyMember = {
    id: 'family-mem-100',
    primaryUserId: 'user-primary-100',
    fullName: 'Ayesha Rahman',
    relation: FamilyRelation.PARENT,
  };

  beforeEach(async () => {
    service = {
      createFamilyMember: jest.fn().mockResolvedValue(mockFamilyMember),
      getFamilyMembers: jest.fn().mockResolvedValue([mockFamilyMember]),
      getFamilyMemberById: jest.fn().mockResolvedValue(mockFamilyMember),
      updateFamilyMember: jest.fn().mockResolvedValue(mockFamilyMember),
      deleteFamilyMember: jest.fn().mockResolvedValue({ success: true }),
      bookFamilyAppointment: jest
        .fn()
        .mockResolvedValue({ id: 'appt-1', familyMemberId: 'family-mem-100' }),
      getFamilyPrescriptions: jest.fn().mockResolvedValue([{ id: 'rx-1' }]),
      createFamilyReminder: jest.fn().mockResolvedValue({ id: 'rem-1' }),
      getFamilyReminders: jest.fn().mockResolvedValue([{ id: 'rem-1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FamilyMemberController],
      providers: [{ provide: FamilyMemberService, useValue: service }],
    }).compile();

    controller = module.get<FamilyMemberController>(FamilyMemberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createFamilyMember', () => {
    it('should delegate family member creation to service', async () => {
      const dto = {
        fullName: 'Ayesha Rahman',
        relation: FamilyRelation.PARENT,
      };
      const result = await controller.createFamilyMember(
        'user-primary-100',
        Role.PATIENT,
        dto,
      );

      expect(service.createFamilyMember).toHaveBeenCalledWith(
        'user-primary-100',
        Role.PATIENT,
        dto,
      );
      expect(result).toBe(mockFamilyMember);
    });
  });

  describe('bookFamilyAppointment', () => {
    it('should delegate appointment booking to service', async () => {
      const dto = {
        doctorId: 'doc-1',
        slotStartTime: '2026-10-10T10:00:00Z',
        slotEndTime: '2026-10-10T10:30:00Z',
        type: AppointmentType.ONLINE,
      };
      const result = await controller.bookFamilyAppointment(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );

      expect(service.bookFamilyAppointment).toHaveBeenCalledWith(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );
      expect(result.id).toBe('appt-1');
    });
  });

  describe('getFamilyPrescriptions', () => {
    it('should delegate prescription viewing to service', async () => {
      const result = await controller.getFamilyPrescriptions(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
      );
      expect(service.getFamilyPrescriptions).toHaveBeenCalledWith(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
      );
      expect(result.length).toBe(1);
    });
  });

  describe('createFamilyReminder', () => {
    it('should delegate reminder setting to service', async () => {
      const dto = {
        prescriptionItemId: 'item-1',
        intakeTime: '2026-10-10T08:00:00Z',
      };
      const result = await controller.createFamilyReminder(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );

      expect(service.createFamilyReminder).toHaveBeenCalledWith(
        'user-primary-100',
        Role.PATIENT,
        'family-mem-100',
        dto,
      );
      expect(result.id).toBe('rem-1');
    });
  });
});
