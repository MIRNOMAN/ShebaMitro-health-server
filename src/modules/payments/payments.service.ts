import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  OrderType,
  PaymentGateway,
  TransactionStatus,
  AppointmentStatus,
  PaymentStatus,
  PharmacyOrderStatus,
  LabOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { BkashService } from './bkash.service.js';
import { StripeService } from './stripe.service.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly hmacWebhookSecret =
    process.env.WEBHOOK_HMAC_SECRET ||
    'shebamitro-webhook-hmac-secret-key-32b!';

  constructor(
    private readonly prisma: PrismaService,
    private readonly bkashService: BkashService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * POST /payments/initiate
   * Create payment initiation for Appointments, LabOrders, and PharmacyOrders with idempotency check
   */
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const { orderType, orderId, paymentGateway } = dto;
    const idempotencyKey =
      dto.idempotencyKey || `idempotency-${orderType.toLowerCase()}-${orderId}`;

    // 1. Idempotency Check: return existing transaction if already initiated
    const existingTransaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });

    if (existingTransaction) {
      this.logger.log(
        `Found existing transaction ${existingTransaction.id} for idempotency key ${idempotencyKey}`,
      );
      return {
        transactionId: existingTransaction.id,
        idempotencyKey: existingTransaction.idempotencyKey,
        status: existingTransaction.status,
        amount: existingTransaction.amount,
        paymentGateway: existingTransaction.paymentGateway,
        paymentIntentId: existingTransaction.paymentIntentId,
        reused: true,
      };
    }

    // 2. Resolve order details, amount, and provider metadata
    let amount = 0;
    let providerId: string | null = null;
    let providerType: string = 'SYSTEM';

    if (orderType === OrderType.APPOINTMENT) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: orderId },
        include: { doctor: true },
      });

      if (!appointment) {
        throw new NotFoundException(`Appointment with ID ${orderId} not found`);
      }

      amount = appointment.doctor?.consultFee || 500;
      providerId = appointment.doctorId;
      providerType = 'DOCTOR';
    } else if (orderType === OrderType.LAB_ORDER) {
      const labOrder = await this.prisma.labOrder.findUnique({
        where: { id: orderId },
      });

      if (!labOrder) {
        throw new NotFoundException(`LabOrder with ID ${orderId} not found`);
      }

      amount = labOrder.totalFee || 600;
      providerId = labOrder.labId;
      providerType = 'LAB';
    } else if (orderType === OrderType.PHARMACY_ORDER) {
      const pharmacyOrder = await this.prisma.pharmacyOrder.findUnique({
        where: { id: orderId },
      });

      if (!pharmacyOrder) {
        throw new NotFoundException(
          `PharmacyOrder with ID ${orderId} not found`,
        );
      }

      amount = pharmacyOrder.totalAmount || 300;
      providerId = pharmacyOrder.pharmacyId;
      providerType = 'PHARMACY';
    } else {
      throw new BadRequestException(`Unsupported order type: ${orderType}`);
    }

    // 3. Automatically compute platform commission (15%) and provider balance payout (85%)
    const platformCommission = Number((amount * 0.15).toFixed(2));
    const providerAmount = Number((amount * 0.85).toFixed(2));

    // 4. Initiate payment with selected Gateway
    let paymentIntentId: string | null = null;
    let paymentUrl: string | null = null;
    let clientSecret: string | null = null;

    if (paymentGateway === PaymentGateway.BKASH) {
      const bkashResult = await this.bkashService.createPayment(
        amount,
        orderId,
      );
      paymentIntentId = bkashResult.paymentID;
      paymentUrl = bkashResult.bkashURL;
    } else if (paymentGateway === PaymentGateway.STRIPE) {
      const stripeResult = await this.stripeService.createPaymentIntent(
        amount,
        'BDT',
        {
          orderId,
          orderType,
        },
      );
      paymentIntentId = stripeResult.paymentIntentId;
      clientSecret = stripeResult.clientSecret;
    }

    // 5. Save Transaction record in DB
    const transaction = await this.prisma.transaction.create({
      data: {
        orderType,
        orderId,
        paymentGateway,
        amount,
        currency: 'BDT',
        status: TransactionStatus.PENDING,
        paymentIntentId,
        idempotencyKey,
        platformCommission,
        providerAmount,
        providerId,
        providerType,
        metadataJson: {
          initiatorUserId: userId,
          paymentUrl,
          clientSecret,
        } as any,
      },
    });

    this.logger.log(
      `Initiated ${paymentGateway} payment for ${orderType} ${orderId}: Transaction ${transaction.id}, Amount: ${amount} BDT (Commission: ${platformCommission}, Provider: ${providerAmount})`,
    );

    return {
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      status: transaction.status,
      orderType,
      orderId,
      amount,
      currency: 'BDT',
      paymentGateway,
      paymentIntentId,
      paymentUrl,
      clientSecret,
      breakdown: {
        totalAmount: amount,
        platformCommission,
        providerAmount,
      },
    };
  }

  /**
   * POST /payments/webhook
   * Robust webhook handling with cryptographic HMAC signature verification and idempotency duplicate transaction prevention
   */
  async handleWebhook(
    rawBody: string | Buffer,
    signatureHeader: string,
    payload: any,
  ) {
    // 1. Cryptographic HMAC Signature Verification
    const isValidSignature = this.verifyHmacSignature(rawBody, signatureHeader);

    if (!isValidSignature) {
      this.logger.warn(
        `Rejected payment webhook: invalid HMAC cryptographic signature`,
      );
      throw new UnauthorizedException(
        'Invalid webhook cryptographic HMAC signature verification',
      );
    }

    // 2. Extract transaction identifiers
    const idempotencyKey = payload.idempotencyKey || payload.idempotency_key;
    const paymentIntentId =
      payload.paymentIntentId || payload.payment_intent || payload.paymentID;
    const externalTrxId =
      payload.trxID ||
      payload.transactionId ||
      payload.id ||
      `trx-${Date.now()}`;

    // Query Transaction by idempotencyKey, paymentIntentId, or ID
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        OR: [
          idempotencyKey ? { idempotencyKey } : undefined,
          paymentIntentId ? { paymentIntentId } : undefined,
          payload.transactionId ? { id: payload.transactionId } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (!transaction) {
      this.logger.warn(
        `Webhook payload could not be matched to a pending Transaction: ${JSON.stringify(payload)}`,
      );
      throw new NotFoundException(
        'Transaction matching webhook payload not found',
      );
    }

    // 3. Idempotency Check: if transaction already completed, prevent duplicate processing
    if (transaction.status === TransactionStatus.COMPLETED) {
      this.logger.log(
        `Ignoring duplicate webhook for already COMPLETED transaction ${transaction.id}`,
      );
      return {
        received: true,
        duplicate: true,
        message: 'Transaction already completed (idempotent)',
        transactionId: transaction.id,
        status: TransactionStatus.COMPLETED,
      };
    }

    // 4. Update Transaction to COMPLETED in a Prisma transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Update transaction record
      const updatedTx = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.COMPLETED,
          transactionId: externalTrxId,
        },
      });

      // Update target order status
      if (transaction.orderType === OrderType.APPOINTMENT) {
        await tx.appointment.update({
          where: { id: transaction.orderId },
          data: {
            paymentStatus: PaymentStatus.PAID,
            status: AppointmentStatus.CONFIRMED,
          },
        });
      } else if (transaction.orderType === OrderType.LAB_ORDER) {
        await tx.labOrder.update({
          where: { id: transaction.orderId },
          data: { status: LabOrderStatus.PENDING },
        });
      } else if (transaction.orderType === OrderType.PHARMACY_ORDER) {
        await tx.pharmacyOrder.update({
          where: { id: transaction.orderId },
          data: { status: PharmacyOrderStatus.PROCESSING },
        });
      }

      // 5. Automatically credit doctor/provider wallet balance
      if (transaction.providerId) {
        await tx.wallet.upsert({
          where: { providerId: transaction.providerId },
          update: {
            balance: { increment: transaction.providerAmount },
            totalEarned: { increment: transaction.providerAmount },
          },
          create: {
            providerId: transaction.providerId,
            providerType: transaction.providerType || 'DOCTOR',
            balance: transaction.providerAmount,
            totalEarned: transaction.providerAmount,
          },
        });

        this.logger.log(
          `Credited ${transaction.providerAmount} BDT to wallet of provider ${transaction.providerId} (${transaction.providerType})`,
        );
      }

      return updatedTx;
    });

    this.logger.log(
      `Successfully processed payment webhook for transaction ${transaction.id}. Order ${transaction.orderType} ${transaction.orderId} marked PAID/CONFIRMED.`,
    );

    return {
      success: true,
      received: true,
      transactionId: result.id,
      orderType: result.orderType,
      orderId: result.orderId,
      status: result.status,
      creditedProviderAmount: result.providerAmount,
      platformCommission: result.platformCommission,
    };
  }

  /**
   * Helper: Verify HMAC cryptographic signature
   */
  verifyHmacSignature(
    rawBody: string | Buffer,
    signatureHeader: string,
  ): boolean {
    if (!signatureHeader) return false;

    // Delegate to StripeService or compute directly using crypto
    const stringBody =
      typeof rawBody === 'string'
        ? rawBody
        : rawBody
          ? rawBody.toString('utf-8')
          : '';

    if (
      this.stripeService.verifyWebhookSignature(
        stringBody,
        signatureHeader,
        this.hmacWebhookSecret,
      )
    ) {
      return true;
    }

    try {
      const computedHmac = crypto
        .createHmac('sha256', this.hmacWebhookSecret)
        .update(stringBody)
        .digest('hex');

      const cleanHeader = signatureHeader.replace(/^sha256=/, '').trim();
      return crypto.timingSafeEqual(
        Buffer.from(computedHmac),
        Buffer.from(cleanHeader),
      );
    } catch {
      return false;
    }
  }

  /**
   * GET /payments/wallet/:providerId
   * Fetch doctor/provider wallet balance & transaction earnings
   */
  async getProviderWallet(providerId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { providerId },
    });

    if (!wallet) {
      return {
        providerId,
        balance: 0,
        totalEarned: 0,
        currency: 'BDT',
      };
    }

    return wallet;
  }
}
