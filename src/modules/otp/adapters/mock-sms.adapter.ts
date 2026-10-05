import { Injectable, Logger } from '@nestjs/common';
import type { SmsAdapter } from './sms-adapter.interface.js';

@Injectable()
export class MockSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(MockSmsAdapter.name);
  public lastSentOtp: { to: string; message: string } | null = null;

  async sendSms(to: string, message: string): Promise<boolean> {
    this.lastSentOtp = { to, message };
    this.logger.log(`[Mock SMS] Sent OTP to ${to}: "${message}"`);
    return true;
  }
}
