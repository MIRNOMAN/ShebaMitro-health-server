import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderType,
  PaymentGateway,
  TransactionStatus,
  AppointmentStatus,
  PaymentStatus,
} from '@prisma/client';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BkashService } from './bkash.service.js';
import { StripeService } from './stripe.service.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: any;
  let bkashService: any;
  let stripeService: any;

  const mockAppointment = {
    id: 'appt-123',
    doctorId: 'doc-456',
    patientId: 'patient-789',
    doctor: { consultFee: 1000 },
  };

  const mockLabOrder = {
    id: 'lab-order-123',
    labId: 'lab-456',
    patientId: 'patient-789',
    totalFee: 1200,
  };

  const mockPharmacyOrder = {
    id: 'pharm-order-123',
    pharmacyId: 'pharm-456',
    patientId: 'patient-789',
    totalAmount: 800,
  };

  const mockTransaction = {
    id: 'tx-999',
    orderType: OrderType.APPOINTMENT,
    orderId: 'appt-123',
    paymentGateway: PaymentGateway.BKASH,
    amount: 1000,
    currency: 'BDT',
    status: TransactionStatus.PENDING,
    paymentIntentId: 'bkash_pay_123',
    idempotencyKey: 'idempotency-key-123',
    platformCommission: 150,
    providerAmount: 850,
    providerId: 'doc-456',
    providerType: 'DOCTOR',
  };

  beforeEach(async () => {
    prismaService = {
      $transaction: jest.fn(async (cb) => cb(prismaService)),
      transaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(mockTransaction),
        create: jest.fn().mockResolvedValue(mockTransaction),
        update: jest.fn().mockResolvedValue({
          ...mockTransaction,
          status: TransactionStatus.COMPLETED,
          transactionId: 'TRX123456',
        }),
      },
      appointment: {
        findUnique: jest.fn().mockResolvedValue(mockAppointment),
        update: jest.fn().mockResolvedValue({
          ...mockAppointment,
          paymentStatus: PaymentStatus.PAID,
          status: AppointmentStatus.CONFIRMED,
        }),
      },
      labOrder: {
        findUnique: jest.fn().mockResolvedValue(mockLabOrder),
        update: jest.fn().mockResolvedValue(mockLabOrder),
      },
      pharmacyOrder: {
        findUnique: jest.fn().mockResolvedValue(mockPharmacyOrder),
        update: jest.fn().mockResolvedValue(mockPharmacyOrder),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          providerId: 'doc-456',
          balance: 850,
          totalEarned: 850,
        }),
        upsert: jest.fn().mockResolvedValue({
          providerId: 'doc-456',
          balance: 850,
          totalEarned: 850,
        }),
      },
    };

    bkashService = {
      createPayment: jest.fn().mockResolvedValue({
        paymentID: 'bkash_pay_123',
        bkashURL:
          'https://tokenized.sandbox.bka.sh/checkout/url?paymentID=bkash_pay_123',
      }),
    };

    stripeService = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_stripe_123',
        clientSecret: 'pi_stripe_123_secret_xyz',
      }),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: BkashService, useValue: bkashService },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    it('should calculate 15% commission and 85% provider payout for bKash Appointment payment', async () => {
      const dto = {
        orderType: OrderType.APPOINTMENT,
        orderId: 'appt-123',
        paymentGateway: PaymentGateway.BKASH,
        idempotencyKey: 'idempotency-key-123',
      };

      const result = await service.initiatePayment('user-pat-1', dto);

      expect(bkashService.createPayment).toHaveBeenCalledWith(1000, 'appt-123');
      expect(prismaService.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderType: OrderType.APPOINTMENT,
          orderId: 'appt-123',
          paymentGateway: PaymentGateway.BKASH,
          amount: 1000,
          platformCommission: 150, // 15% of 1000
          providerAmount: 850, // 85% of 1000
          providerId: 'doc-456',
          providerType: 'DOCTOR',
        }),
      });

      expect(result.breakdown?.platformCommission).toBe(150);
      expect(result.breakdown?.providerAmount).toBe(850);
      expect(result.paymentUrl).toBeDefined();
    });

    it('should create Stripe PaymentIntent for PharmacyOrder payment', async () => {
      const dto = {
        orderType: OrderType.PHARMACY_ORDER,
        orderId: 'pharm-order-123',
        paymentGateway: PaymentGateway.STRIPE,
        idempotencyKey: 'idempotency-pharm-123',
      };

      const result = await service.initiatePayment('user-pat-1', dto);

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        800,
        'BDT',
        expect.any(Object),
      );
      expect(result.clientSecret).toBe('pi_stripe_123_secret_xyz');
    });

    it('should return existing transaction if idempotency key already exists', async () => {
      prismaService.transaction.findUnique.mockResolvedValueOnce(
        mockTransaction,
      );

      const dto = {
        orderType: OrderType.APPOINTMENT,
        orderId: 'appt-123',
        paymentGateway: PaymentGateway.BKASH,
        idempotencyKey: 'idempotency-key-123',
      };

      const result = await service.initiatePayment('user-pat-1', dto);

      expect(prismaService.transaction.create).not.toHaveBeenCalled();
      expect(result.reused).toBe(true);
      expect(result.transactionId).toBe('tx-999');
    });
  });

  describe('handleWebhook', () => {
    it('should verify HMAC signature, transition order status to PAID/CONFIRMED, and credit provider wallet', async () => {
      const payload = {
        paymentIntentId: 'bkash_pay_123',
        trxID: 'TRX123456',
      };

      const result = await service.handleWebhook(
        JSON.stringify(payload),
        'valid-hmac-signature',
        payload,
      );

      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-123' },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: AppointmentStatus.CONFIRMED,
        },
      });

      // Verify doctor wallet was credited with providerAmount (850 BDT)
      expect(prismaService.wallet.upsert).toHaveBeenCalledWith({
        where: { providerId: 'doc-456' },
        update: {
          balance: { increment: 850 },
          totalEarned: { increment: 850 },
        },
        create: {
          providerId: 'doc-456',
          providerType: 'DOCTOR',
          balance: 850,
          totalEarned: 850,
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should reject webhook if HMAC cryptographic signature verification fails', async () => {
      stripeService.verifyWebhookSignature.mockReturnValueOnce(false);
      jest.spyOn(service, 'verifyHmacSignature').mockReturnValueOnce(false);

      await expect(
        service.handleWebhook('raw-body', 'invalid-sig', {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should ignore duplicate webhooks if transaction is already COMPLETED', async () => {
      prismaService.transaction.findFirst.mockResolvedValueOnce({
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      });

      const payload = { paymentIntentId: 'bkash_pay_123' };
      const result = await service.handleWebhook('raw-body', 'sig', payload);

      expect(result.duplicate).toBe(true);
      expect(prismaService.wallet.upsert).not.toHaveBeenCalled();
    });
  });
});
