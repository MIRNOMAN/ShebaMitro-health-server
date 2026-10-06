import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PharmacyOrderStatus } from '@prisma/client';
import { PharmacyService } from './pharmacy.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('PharmacyService', () => {
  let service: PharmacyService;
  let prismaService: any;

  const mockPatientProfile = {
    id: 'patient-456',
    userId: 'user-pat-1',
    user: { name: 'Abdul', phone: '8801700000000', email: 'abdul@example.com' },
  };

  const mockPharmacyProfile = {
    id: 'pharmacy-789',
    userId: 'user-pharm-1',
    tradeName: 'Lazz Pharma Dhanmondi',
    drugLicenseNo: 'DL-998877',
  };

  const mockPrescription = {
    id: 'rx-123',
    appointmentId: 'appt-111',
    doctorId: 'doc-222',
    patientId: 'patient-456',
    diagnosis: 'Bronchial Asthma',
    qrCodeHash: 'mock-sha256-hash-1234567890abcdef',
    isDispensed: false,
    dispensedAt: null,
    dispensedByPharmacyId: null,
    doctor: {
      id: 'doc-222',
      name: 'Dr. Rahat Ali',
      bmdcRegNo: 'A-12345',
      specialization: 'Pulmonology',
      isApproved: true,
    },
    patient: mockPatientProfile,
    items: [
      {
        id: 'item-1',
        medicineName: 'Seretide Evohaler',
        genericName: 'Salmeterol + Fluticasone',
        dosageForm: 'Inhaler',
        schedulePattern: '1+0+1',
        durationDays: 30,
      },
    ],
  };

  const mockControlledPrescription = {
    ...mockPrescription,
    id: 'rx-narcotic-999',
    qrCodeHash: 'mock-narcotic-hash-1234567890abcdef',
    isDispensed: true,
    dispensedAt: new Date('2026-10-05T10:00:00.000Z'),
    dispensedByPharmacyId: 'pharmacy-789',
    items: [
      {
        id: 'item-narcotic-1',
        medicineName: 'Diazepam 5mg',
        genericName: 'Diazepam',
        dosageForm: 'Tablet',
        schedulePattern: '0+0+1',
        durationDays: 7,
      },
    ],
  };

  const mockPharmacyOrder = {
    id: 'order-pharm-101',
    patientId: 'patient-456',
    pharmacyId: 'pharmacy-789',
    prescriptionId: 'rx-123',
    totalAmount: 660,
    status: PharmacyOrderStatus.PENDING,
  };

  beforeEach(async () => {
    prismaService = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      pharmacyProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPharmacyProfile),
      },
      prescription: {
        findUnique: jest.fn().mockResolvedValue(mockPrescription),
        findFirst: jest.fn().mockResolvedValue(mockPrescription),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...mockPrescription,
          ...data,
        })),
      },
      pharmacyOrder: {
        create: jest.fn().mockResolvedValue(mockPharmacyOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<PharmacyService>(PharmacyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCartOrder', () => {
    it('should convert verified prescription items into a pharmacy cart order', async () => {
      const dto = {
        prescriptionId: 'rx-123',
        pharmacyId: 'pharmacy-789',
        shippingAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
      };

      const result = await service.createCartOrder('user-pat-1', dto);

      expect(prismaService.pharmacyOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 'patient-456',
          pharmacyId: 'pharmacy-789',
          prescriptionId: 'rx-123',
          status: PharmacyOrderStatus.PENDING,
        }),
        include: expect.any(Object),
      });

      expect(result.id).toBe('order-pharm-101');
    });

    it('should throw NotFoundException if prescription does not exist', async () => {
      prismaService.prescription.findUnique.mockResolvedValueOnce(null);

      const dto = {
        prescriptionId: 'invalid-rx',
        pharmacyId: 'pharmacy-789',
        shippingAddress: 'Address',
      };

      await expect(service.createCartOrder('user-pat-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyQrAndDispense', () => {
    it('should verify QR signature legitimacy and mark prescription as DISPENSED', async () => {
      const result = await service.verifyQrAndDispense(
        'mock-sha256-hash-1234567890abcdef',
        'user-pharm-1',
      );

      expect(prismaService.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-123' },
        data: expect.objectContaining({
          isDispensed: true,
          dispensedAt: expect.any(Date),
        }),
      });

      expect(result.isSignatureLegitimate).toBe(true);
      expect(result.isDispensed).toBe(true);
      expect(result.doctor.bmdcRegNo).toBe('A-12345');
    });

    it('should BLOCK duplicate dispensing of controlled substances if already dispensed', async () => {
      prismaService.prescription.findFirst.mockResolvedValueOnce(
        mockControlledPrescription,
      );

      await expect(
        service.verifyQrAndDispense('mock-narcotic-hash-1234567890abcdef'),
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.prescription.update).not.toHaveBeenCalled();
    });
  });
});
