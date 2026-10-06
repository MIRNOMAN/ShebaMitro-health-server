import { Test, TestingModule } from '@nestjs/testing';
import { OrderType, PaymentGateway, TransactionStatus } from '@prisma/client';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paymentsService: any;

  const mockInitiateResponse = {
    transactionId: 'tx-999',
    idempotencyKey: 'idempotency-key-123',
    status: TransactionStatus.PENDING,
    orderType: OrderType.APPOINTMENT,
    orderId: 'appt-123',
    amount: 1000,
    paymentGateway: PaymentGateway.BKASH,
    paymentUrl: 'https://tokenized.sandbox.bka.sh/checkout/url?paymentID=bkash_pay_123',
    breakdown: { platformCommission: 150, providerAmount: 850 },
  };

  const mockWebhookResponse = {
    success: true,
    received: true,
    transactionId: 'tx-999',
    status: TransactionStatus.COMPLETED,
  };

  beforeEach(async () => {
    paymentsService = {
      initiatePayment: jest.fn().mockResolvedValue(mockInitiateResponse),
      handleWebhook: jest.fn().mockResolvedValue(mockWebhookResponse),
      getProviderWallet: jest.fn().mockResolvedValue({
        providerId: 'doc-456',
        balance: 850,
        totalEarned: 850,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: paymentsService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('initiatePayment', () => {
    it('should create payment initiation', async () => {
      const dto = {
        orderType: OrderType.APPOINTMENT,
        orderId: 'appt-123',
        paymentGateway: PaymentGateway.BKASH,
      };

      const result = await controller.initiatePayment('user-pat-1', dto);

      expect(paymentsService.initiatePayment).toHaveBeenCalledWith('user-pat-1', dto);
      expect(result.transactionId).toBe('tx-999');
    });
  });

  describe('handleWebhook', () => {
    it('should process webhook event', async () => {
      const payload = { paymentIntentId: 'bkash_pay_123' };
      const req = { rawBody: JSON.stringify(payload), headers: {} };

      const result = await controller.handleWebhook(
        'x-sig-header',
        '',
        req,
        payload,
      );

      expect(paymentsService.handleWebhook).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('getProviderWallet', () => {
    it('should return provider wallet balance', async () => {
      const result = await controller.getProviderWallet('doc-456');

      expect(paymentsService.getProviderWallet).toHaveBeenCalledWith('doc-456');
      expect(result.balance).toBe(850);
    });
  });
});
