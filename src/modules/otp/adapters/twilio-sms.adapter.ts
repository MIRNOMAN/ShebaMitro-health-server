import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsAdapter } from './sms-adapter.interface.js';

@Injectable()
export class TwilioSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(TwilioSmsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async sendSms(to: string, message: string): Promise<boolean> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const fromPhone = this.configService.get<string>('TWILIO_FROM_PHONE');

    this.logger.log(
      `[Twilio SMS] Sending OTP SMS to ${to}: "${message}" (AccountSID: ${accountSid || 'mock'})`,
    );
    return true;
  }
}
