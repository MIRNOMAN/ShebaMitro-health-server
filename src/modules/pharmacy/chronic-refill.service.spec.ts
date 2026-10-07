import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PharmacyOrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { WhatsAppService } from '../prescriptions/whatsapp.service.js';
import { WebPushService } from '../prescriptions/web-push.service.js';
import {
  ChronicRefillService,
  CHRONIC_REFILL_QUEUE,
} from './chronic-refill.service.js';
import { PrescriptionFinalizedEvent } from '../prescriptions/events/prescription-finalized.event.js';

describe('ChronicRefillService', () => {
  let service: ChronicRefillService;
  let prisma: any;
  let refillQueue: any;
  let whatsAppService: any;
  let webPushService: any;

  const mockPatientProfile = {
    id: 'patient-uuid-1',
    userId: 'user-patient-1',
    user: {
      id: 'user-patient-1',
      name: 'Rahim Uddin',
      phone: '8801711223344',
      email: 'rahim@shebamitro.health',
    },
  };

  const mockPartnerPharmacy = {
    id: 'pharmacy-uuid-1',
    userId: 'user-pharm-1',
    tradeName: 'Lazz Pharma (Dhanmondi)',
    drugLicenseNo: 'DL-12345-DHAKA',
    address: 'Road 27, Dhanmondi, Dhaka',
    deliveryAvailable: true,
  };

  const mockPrescription = {
    id: 'rx-chronic-101',
    appointmentId: 'appt-101',
    doctorId: 'doc-uuid-1',
    patientId: 'patient-uuid-1',
    diagnosis: 'Type 2 Diabetes Mellitus & Hypertension',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    doctor: {
      name: 'Dr. Shahabuddin Ahmed',
      specialization: 'Cardiology & Diabetology',
      bmdcRegNo: 'A-45678',
    },
    items: [
      {
        id: 'item-chronic-1',
        prescriptionId: 'rx-chronic-101',
        medicineName: 'Metformin 500mg',
        genericName: 'Metformin Hydrochloride',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+1',
        mealTiming: 'AFTER_MEAL',
        durationDays: 30,
        isChronic: true,
      },
      {
        id: 'item-chronic-2',
        prescriptionId: 'rx-chronic-101',
        medicineName: 'Amlodipine 5mg',
        genericName: 'Amlodipine Besylate',
        dosageForm: 'Tablet',
        schedulePattern: '0+0+1',
        mealTiming: 'AFTER_MEAL',
        durationDays: 90,
      },
      {
        id: 'item-acute-3',
        prescriptionId: 'rx-chronic-101',
        medicineName: 'Napa Extra',
        genericName: 'Paracetamol',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+1',
        mealTiming: 'AFTER_MEAL',
        durationDays: 5,
        isChronic: false,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      prescription: {
        findUnique: jest.fn().mockResolvedValue(mockPrescription),
      },
      pharmacyProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPartnerPharmacy),
        findFirst: jest.fn().mockResolvedValue(mockPartnerPharmacy),
      },
      pharmacyOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'pharm-order-uuid-999',
            ...data,
            pharmacy: mockPartnerPharmacy,
            patient: mockPatientProfile,
            createdAt: new Date(),
          }),
        ),
      },
    };

    refillQueue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job-chronic-refill-1' }),
    };

    whatsAppService = {
      sendChronicRefillReminder: jest.fn().mockResolvedValue({ success: true }),
    };

    webPushService = {
      sendChronicRefillNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChronicRefillService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(CHRONIC_REFILL_QUEUE), useValue: refillQueue },
        { provide: WhatsAppService, useValue: whatsAppService },
        { provide: WebPushService, useValue: webPushService },
      ],
    }).compile();

    service = module.get<ChronicRefillService>(ChronicRefillService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isChronicEligible', () => {
    it('should return true if item is marked isChronic: true', () => {
      expect(service.isChronicEligible({ isChronic: true, durationDays: 14 })).toBe(true);
    });

    it('should return true if item durationDays >= 30', () => {
      expect(service.isChronicEligible({ durationDays: 30 })).toBe(true);
      expect(service.isChronicEligible({ durationDays: 60 })).toBe(true);
    });

    it('should return false for acute item with duration < 30 days and no isChronic flag', () => {
      expect(service.isChronicEligible({ durationDays: 7, isChronic: false })).toBe(false);
      expect(service.isChronicEligible({ durationDays: 10 })).toBe(false);
    });
  });

  describe('calculateDepletionDate & calculateReminderScheduleTime', () => {
    it('should accurately calculate depletion date 30 days after start date', () => {
      const startDate = new Date('2026-10-01T00:00:00.000Z');
      const depletionDate = service.calculateDepletionDate(startDate, 30);

      // 30 days = 30 * 24 * 60 * 60 * 1000 = 2592000000 ms
      expect(depletionDate.getTime()).toBe(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(depletionDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    });

    it('should calculate reminder schedule time exactly 72 hours prior to run out', () => {
      const depletionDate = new Date('2026-10-31T00:00:00.000Z');
      const reminderTime = service.calculateReminderScheduleTime(depletionDate, 72);

      // 72 hours = 72 * 60 * 60 * 1000 = 259200000 ms (3 days prior)
      expect(reminderTime.getTime()).toBe(depletionDate.getTime() - 72 * 60 * 60 * 1000);
      expect(reminderTime.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    });
  });

  describe('evaluateAndSchedulePrescription', () => {
    it('should schedule BullMQ 72h-prior jobs for chronic items and skip acute items', async () => {
      const startDate = new Date('2026-10-01T00:00:00.000Z');
      const results = await service.evaluateAndSchedulePrescription(
        'rx-chronic-101',
        mockPrescription.items,
        startDate,
      );

      // Items 1 (isChronic: true, 30d) and 2 (90d) should be scheduled; Item 3 (5d) skipped
      expect(results.length).toBe(2);
      expect(results[0].medicineName).toBe('Metformin 500mg');
      expect(results[1].medicineName).toBe('Amlodipine 5mg');

      expect(refillQueue.add).toHaveBeenCalledTimes(2);
      expect(refillQueue.add).toHaveBeenCalledWith(
        'send-chronic-refill-reminder',
        expect.objectContaining({
          prescriptionId: 'rx-chronic-101',
          medicineName: 'Metformin 500mg',
          reorderUrl: expect.stringContaining('/api/v1/pharmacy/refill-order'),
        }),
        expect.objectContaining({
          jobId: 'chronic-refill-rx-chronic-101-item-chronic-1',
          removeOnComplete: true,
          attempts: 3,
        }),
      );
    });
  });

  describe('handlePrescriptionFinalized event listener', () => {
    it('should handle PrescriptionFinalizedEvent and trigger evaluation', async () => {
      const event = new PrescriptionFinalizedEvent(
        'rx-chronic-101',
        'appt-101',
        'doc-uuid-1',
        'patient-uuid-1',
        new Date('2026-10-01T00:00:00.000Z'),
        mockPrescription,
      );

      await service.handlePrescriptionFinalized(event);
      expect(refillQueue.add).toHaveBeenCalled();
    });
  });

  describe('provisionRefillOrder (1-Click Refill Re-Order)', () => {
    it('should automatically provision order with patient preferred partner pharmacy', async () => {
      const dto = {
        prescriptionId: 'rx-chronic-101',
        prescriptionItemId: 'item-chronic-1',
        shippingAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
      };

      const result = await service.provisionRefillOrder('user-patient-1', dto);

      expect(result.success).toBe(true);
      expect(result.partnerPharmacy.name).toBe('Lazz Pharma (Dhanmondi)');
      expect(result.shippingAddress).toBe('House 12, Road 5, Dhanmondi, Dhaka');
      expect(prisma.pharmacyOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient-uuid-1',
            pharmacyId: 'pharmacy-uuid-1',
            prescriptionId: 'rx-chronic-101',
            status: PharmacyOrderStatus.PENDING,
          }),
        }),
      );

      // Verify schedule of next cycle's reminder
      expect(refillQueue.add).toHaveBeenCalled();
    });

    it('should throw NotFoundException if prescription does not exist', async () => {
      prisma.prescription.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.provisionRefillOrder('user-patient-1', { prescriptionId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if patient does not own the prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValueOnce({
        ...mockPrescription,
        patientId: 'another-patient-uuid',
      });

      await expect(
        service.provisionRefillOrder('user-patient-1', { prescriptionId: 'rx-chronic-101' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should fallback to last order pharmacy and shipping address if not provided in DTO', async () => {
      prisma.pharmacyOrder.findFirst.mockResolvedValue({
        pharmacy: {
          id: 'pharmacy-prev-1',
          tradeName: 'Tamanna Pharmacy',
          address: 'Gulshan 2, Dhaka',
        },
        shippingAddress: 'Gulshan Avenue 11, Dhaka',
      });

      const result = await service.provisionRefillOrder('user-patient-1', {
        prescriptionId: 'rx-chronic-101',
      });

      expect(result.success).toBe(true);
      expect(result.partnerPharmacy.name).toBe('Tamanna Pharmacy');
      expect(result.shippingAddress).toBe('Gulshan Avenue 11, Dhaka');
    });
  });
});
