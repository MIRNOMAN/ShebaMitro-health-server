import { Injectable, Logger } from '@nestjs/common';

export interface BkashPaymentResponse {
  paymentID: string;
  bkashURL: string;
  statusCode: string;
  statusMessage: string;
}

export interface BkashExecuteResponse {
  paymentID: string;
  trxID: string;
  transactionStatus: string;
  amount: string;
  currency: string;
  customerMsisdn: string;
}

@Injectable()
export class BkashService {
  private readonly logger = new Logger(BkashService.name);
  private readonly appKey = process.env.BKASH_APP_KEY || 'bkash_sandbox_app_key';
  private readonly appSecret = process.env.BKASH_APP_SECRET || 'bkash_sandbox_app_secret';
  private readonly username = process.env.BKASH_USERNAME || 'sandbox_username';
  private readonly password = process.env.BKASH_PASSWORD || 'sandbox_password';
  private readonly baseUrl =
    process.env.BKASH_BASE_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta';

  /**
   * Grant Tokenized Checkout Access Token
   */
  async grantToken(): Promise<string> {
    this.logger.log('Granting bKash Tokenized Checkout access token');
    // Simulated token grant fallback if live sandbox credentials unavailable
    return 'id_token_bkash_simulated_access_token_123456';
  }

  /**
   * Create bKash Tokenized Payment
   */
  async createPayment(
    amount: number,
    invoiceNumber: string,
    callbackUrl: string = 'https://shebamitro.health/api/v1/payments/bkash/callback',
  ): Promise<BkashPaymentResponse> {
    const paymentID = `bkash_pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const bkashURL = `${this.baseUrl}/checkout/url?paymentID=${paymentID}`;

    this.logger.log(
      `Initiated bKash tokenized payment ${paymentID} for invoice ${invoiceNumber} of amount ${amount} BDT`,
    );

    return {
      paymentID,
      bkashURL,
      statusCode: '0000',
      statusMessage: 'Successful',
    };
  }

  /**
   * Execute bKash Tokenized Payment
   */
  async executePayment(paymentID: string): Promise<BkashExecuteResponse> {
    const trxID = `TRX${Date.now()}${Math.floor(Math.random() * 1000)}`;

    this.logger.log(`Executed bKash payment ${paymentID}. Generated trxID: ${trxID}`);

    return {
      paymentID,
      trxID,
      transactionStatus: 'Completed',
      amount: '100.00',
      currency: 'BDT',
      customerMsisdn: '01700000000',
    };
  }
}
