import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;

  const mockDoctorProfile = {
    id: 'doc-123',
    userId: 'user-doc-123',
    name: 'Dr. Karimgonj',
    bmdcRegNo: 'BMDC-A-98765',
    bmdcDocUrl: 'https://s3.amazonaws.com/bmdc/98765.pdf',
    specialization: 'Neurology',
    qualifications: ['MBBS', 'FCPS'],
    experienceYears: 10,
    consultFee: 1000,
    followUpFee: 600,
    isApproved: false,
    hospital: 'Dhaka Medical',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    user: {
      id: 'user-doc-123',
      name: 'Dr. Karimgonj',
      email: 'karim@example.com',
      phone: '01712345678',
      isVerified: false,
      createdAt: new Date('2026-01-01'),
    },
  };

  const mockWalletDoctor = {
    id: 'wallet-doc-123',
    providerId: 'doc-123',
    providerType: 'DOCTOR',
    balance: 5000,
    totalEarned: 10000,
    updatedAt: new Date(),
  };

  const mockWalletLab = {
    id: 'wallet-lab-456',
    providerId: 'lab-456',
    providerType: 'LAB',
    balance: 15000,
    totalEarned: 25000,
    updatedAt: new Date(),
  };

  const mockLabProfile = {
    id: 'lab-456',
    userId: 'user-lab-456',
    licenseNo: 'LAB-LIC-456',
    labName: 'Popular Diagnostic Center',
    address: 'Dhanmondi, Dhaka',
    user: {
      name: 'Popular Lab',
      email: 'info@populardiagnostic.com',
      phone: '01812345678',
    },
  };

  const mockTransaction = {
    id: 'tx-1',
    providerId: 'doc-123',
    providerType: 'DOCTOR',
    amount: 1000,
    providerAmount: 850,
    platformCommission: 150,
    status: 'COMPLETED',
  };

  beforeEach(async () => {
    prisma = {
      doctorProfile: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockDoctorProfile]),
        findFirst: jest.fn().mockResolvedValue(mockDoctorProfile),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...mockDoctorProfile,
          isApproved: data.isApproved,
        })),
      },
      user: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'user-doc-123', isVerified: true }),
      },
      labProfile: {
        findMany: jest.fn().mockResolvedValue([mockLabProfile]),
      },
      wallet: {
        findMany: jest
          .fn()
          .mockResolvedValue([mockWalletDoctor, mockWalletLab]),
        findUnique: jest.fn().mockResolvedValue(mockWalletDoctor),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'w-new', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...mockWalletDoctor,
          balance: mockWalletDoctor.balance - (data.balance?.decrement || 0),
        })),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([mockTransaction]),
      },
      payout: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'payout-uuid-1',
          ...data,
          disbursedAt: new Date(),
        })),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVerifications', () => {
    it('should return paginated list of unverified doctors with BMDC license docs', async () => {
      const result = await service.getVerifications({ page: 1, limit: 10 });
      expect(result.data.length).toBe(1);
      expect(result.data[0].bmdcRegNo).toBe('BMDC-A-98765');
      expect(result.data[0].bmdcDocUrl).toBe(
        'https://s3.amazonaws.com/bmdc/98765.pdf',
      );
      expect(result.data[0].isApproved).toBe(false);
      expect(result.meta.total).toBe(1);
    });

    it('should apply search filter if search term provided', async () => {
      await service.getVerifications({
        page: 1,
        limit: 10,
        search: 'Karimgonj',
      });
      expect(prisma.doctorProfile.findMany).toHaveBeenCalled();
    });
  });

  describe('verifyProvider', () => {
    it('should approve doctor profile and log audit trail', async () => {
      const result = await service.verifyProvider(
        'doc-123',
        { approved: true, notes: 'BMDC document verified' },
        'admin-user-1',
      );

      expect(result.provider.isApproved).toBe(true);
      expect(result.audit.action).toBe('PROVIDER_APPROVED');
      expect(prisma.doctorProfile.update).toHaveBeenCalledWith({
        where: { id: 'doc-123' },
        data: { isApproved: true },
        include: expect.any(Object),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-doc-123' },
        data: { isVerified: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should reject doctor profile when approved is false', async () => {
      const result = await service.verifyProvider(
        'doc-123',
        { approved: false, rejectionReason: 'Invalid BMDC Reg No' },
        'admin-user-1',
      );

      expect(result.provider.isApproved).toBe(false);
      expect(result.audit.action).toBe('PROVIDER_REJECTED');
      expect(result.audit.rejectionReason).toBe('Invalid BMDC Reg No');
    });

    it('should throw NotFoundException if provider profile does not exist', async () => {
      prisma.doctorProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyProvider('non-existent-id', { approved: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSettlements', () => {
    it('should calculate payable balances to doctors and labs based on transactions and wallets', async () => {
      const result = await service.getSettlements();
      expect(result.summary.totalProvidersCount).toBe(2);
      expect(result.summary.totalPayableAmount).toBe(20000); // 5000 + 15000
      expect(result.settlements.length).toBe(2);
      expect(result.settlements[0].providerId).toBe('doc-123');
      expect(result.settlements[0].payableBalance).toBe(5000);
      expect(result.settlements[1].providerId).toBe('lab-456');
      expect(result.settlements[1].payableBalance).toBe(15000);
    });
  });

  describe('executePayouts', () => {
    it('should disburse batch payouts via bank/MFS and deduct wallet balances', async () => {
      const dto = {
        payouts: [
          {
            providerId: 'doc-123',
            providerType: 'DOCTOR',
            amount: 2000,
            paymentMethod: 'BKASH',
            accountDetails: { accountNumber: '01712345678' },
          },
        ],
      };

      const result = await service.executePayouts(dto, 'admin-1');

      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.totalDisbursedAmount).toBe(2000);
      expect(result.disbursements[0].remainingWalletBalance).toBe(3000); // 5000 - 2000
      expect(prisma.wallet.update).toHaveBeenCalled();
      expect(prisma.payout.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should flag failure if provider wallet balance is insufficient', async () => {
      const dto = {
        payouts: [
          {
            providerId: 'doc-123',
            providerType: 'DOCTOR',
            amount: 99999,
            paymentMethod: 'BANK',
            accountDetails: { accountNumber: '12345678' },
          },
        ],
      };

      const result = await service.executePayouts(dto, 'admin-1');

      expect(result.successfulCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.failures[0].reason).toContain(
        'Insufficient wallet balance',
      );
    });

    it('should throw BadRequestException if payout list is empty', async () => {
      await expect(
        service.executePayouts({ payouts: [] }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
