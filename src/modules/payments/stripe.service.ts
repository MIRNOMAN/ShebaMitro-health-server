import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface StripePaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stripe_key';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_stripe_secret';

  /**
   * Create Stripe PaymentIntent
   */
  async createPaymentIntent(
    amount: number,
    currency: string = 'BDT',
    metadata: Record<string, any> = {},
  ): Promise<StripePaymentIntentResponse> {
    const paymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const clientSecret = `${paymentIntentId}_secret_${Math.random().toString(36).substring(7)}`;

    this.logger.log(
      `Created Stripe PaymentIntent ${paymentIntentId} for amount ${amount} ${currency}`,
    );

    return {
      paymentIntentId,
      clientSecret,
      amount,
      currency,
    };
  }

  /**
   * Verify Stripe / HMAC Webhook Cryptographic Signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signatureHeader: string,
    secret?: string,
  ): boolean {
    const targetSecret = secret || this.webhookSecret;

    if (!signatureHeader || !payload) {
      return false;
    }

    try {
      const hmac = crypto
        .createHmac('sha256', targetSecret)
        .update(payload)
        .digest('hex');

      // Compare signature against signatureHeader (supports both raw hex and stripe-signature t=timestamp,v1=hash format)
      if (signatureHeader.includes('v1=')) {
        const parts = signatureHeader.split(',');
        const v1Part = parts.find((p) => p.startsWith('v1='));
        if (v1Part) {
          const v1Hash = v1Part.replace('v1=', '');
          return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1Hash));
        }
      }

      return crypto.timingSafeEqual(
        Buffer.from(hmac),
        Buffer.from(signatureHeader.replace('sha256=', '')),
      );
    } catch (err: any) {
      this.logger.warn(`Stripe Webhook cryptographic signature verification failed: ${err.message}`);
      return false;
    }
  }
}
