import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: any;

  const mockVerificationsResponse = {
    data: [
      {
        id: 'doc-1',
        bmdcRegNo: 'A-1111',
        bmdcDocUrl: 'https://s3.amazonaws.com/bmdc/1111.pdf',
        isApproved: false,
      },
    ],
    meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };

  const mockVerifyResponse = {
    message: "Provider 'Dr. Test' status updated to APPROVED.",
    provider: { id: 'doc-1', isApproved: true },
  };

  const mockSettlementsResponse = {
    summary: { totalProvidersCount: 1, totalPayableAmount: 5000 },
    settlements: [{ providerId: 'doc-1', payableBalance: 5000 }],
  };

  const mockPayoutsResponse = {
    message: 'Batch payout execution completed. 1 disbursed, 0 failed.',
    successfulCount: 1,
    failedCount: 0,
    totalDisbursedAmount: 5000,
  };

  beforeEach(async () => {
    adminService = {
      getVerifications: jest.fn().mockResolvedValue(mockVerificationsResponse),
      verifyProvider: jest.fn().mockResolvedValue(mockVerifyResponse),
      getSettlements: jest.fn().mockResolvedValue(mockSettlementsResponse),
      executePayouts: jest.fn().mockResolvedValue(mockPayoutsResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getVerifications', () => {
    it('should return paginated unverified provider list', async () => {
      const result = await controller.getVerifications({ page: 1, limit: 10 });
      expect(result).toEqual(mockVerificationsResponse);
      expect(adminService.getVerifications).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('verifyProvider', () => {
    it('should call verifyProvider on service with providerId and dto', async () => {
      const result = await controller.verifyProvider(
        'doc-1',
        { approved: true, notes: 'OK' },
        'admin-user-1',
      );
      expect(result).toEqual(mockVerifyResponse);
      expect(adminService.verifyProvider).toHaveBeenCalledWith(
        'doc-1',
        { approved: true, notes: 'OK' },
        'admin-user-1',
      );
    });
  });

  describe('getSettlements', () => {
    it('should return payable balance calculations', async () => {
      const result = await controller.getSettlements();
      expect(result).toEqual(mockSettlementsResponse);
      expect(adminService.getSettlements).toHaveBeenCalled();
    });
  });

  describe('executePayouts', () => {
    it('should execute batch payouts via adminService', async () => {
      const dto = {
        payouts: [
          {
            providerId: 'doc-1',
            providerType: 'DOCTOR',
            amount: 5000,
            paymentMethod: 'BKASH',
            accountDetails: { accountNumber: '01700000000' },
          },
        ],
      };
      const result = await controller.executePayouts(dto, 'admin-user-1');
      expect(result).toEqual(mockPayoutsResponse);
      expect(adminService.executePayouts).toHaveBeenCalledWith(dto, 'admin-user-1');
    });
  });
});
