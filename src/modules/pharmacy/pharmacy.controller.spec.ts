import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyOrderStatus } from '@prisma/client';
import { PharmacyController } from './pharmacy.controller.js';
import { PharmacyService } from './pharmacy.service.js';
import { ChronicRefillService } from './chronic-refill.service.js';

describe('PharmacyController', () => {
  let controller: PharmacyController;
  let pharmacyService: any;
  let chronicRefillService: any;

  const mockOrderResponse = {
    id: 'order-pharm-101',
    patientId: 'patient-456',
    pharmacyId: 'pharmacy-789',
    prescriptionId: 'rx-123',
    totalAmount: 660,
    status: PharmacyOrderStatus.PENDING,
  };

  const mockRefillResponse = {
    success: true,
    message: '1-click chronic medicine refill order provisioned successfully',
    order: mockOrderResponse,
    partnerPharmacy: {
      id: 'pharmacy-789',
      name: 'Lazz Pharma (Dhanmondi)',
      address: 'Dhanmondi 27, Dhaka',
    },
    shippingAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
    totalAmount: 660,
    deliveryFee: 60,
    items: [],
    refilledPrescriptionId: 'rx-123',
  };

  const mockVerifyResponse = {
    isSignatureLegitimate: true,
    prescriptionId: 'rx-123',
    qrCodeHash: 'mock-sha256-hash-1234567890abcdef',
    isDispensed: true,
    dispensedAt: new Date(),
    doctor: { name: 'Dr. Rahat Ali', bmdcRegNo: 'A-12345' },
    controlledSubstancesAnalysis: { hasControlledSubstances: false },
  };

  beforeEach(async () => {
    pharmacyService = {
      createCartOrder: jest.fn().mockResolvedValue(mockOrderResponse),
      verifyQrAndDispense: jest.fn().mockResolvedValue(mockVerifyResponse),
    };

    chronicRefillService = {
      provisionRefillOrder: jest.fn().mockResolvedValue(mockRefillResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PharmacyController],
      providers: [
        { provide: PharmacyService, useValue: pharmacyService },
        { provide: ChronicRefillService, useValue: chronicRefillService },
      ],
    }).compile();

    controller = module.get<PharmacyController>(PharmacyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCartOrder', () => {
    it('should convert prescription items into a cart order', async () => {
      const dto = {
        prescriptionId: 'rx-123',
        pharmacyId: 'pharmacy-789',
        shippingAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
      };

      const result = await controller.createCartOrder('user-pat-1', dto);

      expect(pharmacyService.createCartOrder).toHaveBeenCalledWith('user-pat-1', dto);
      expect(result.id).toBe('order-pharm-101');
    });
  });

  describe('refillOrder', () => {
    it('should provision 1-click chronic medicine refill order', async () => {
      const dto = {
        prescriptionId: 'rx-123',
        prescriptionItemId: 'item-456',
        shippingAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
      };

      const result = await controller.refillOrder('user-pat-1', dto);

      expect(chronicRefillService.provisionRefillOrder).toHaveBeenCalledWith('user-pat-1', dto);
      expect(result.success).toBe(true);
      expect(result.partnerPharmacy.name).toBe('Lazz Pharma (Dhanmondi)');
      expect(result.order.id).toBe('order-pharm-101');
    });
  });

  describe('verifyQrAndDispense', () => {
    it('should verify QR signature legitimacy and mark prescription as DISPENSED', async () => {
      const result = await controller.verifyQrAndDispense(
        'mock-sha256-hash-1234567890abcdef',
        'user-pharm-1',
      );

      expect(pharmacyService.verifyQrAndDispense).toHaveBeenCalledWith(
        'mock-sha256-hash-1234567890abcdef',
        'user-pharm-1',
      );

      expect(result.isSignatureLegitimate).toBe(true);
      expect(result.isDispensed).toBe(true);
    });
  });
});

