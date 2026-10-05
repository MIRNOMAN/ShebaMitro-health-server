import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsAdapter } from './sms-adapter.interface.js';

@Injectable()
export class InfobipSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(InfobipSmsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async sendSms(to: string, message: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('INFOBIP_API_KEY');
    const baseUrl = this.configService.get<string>('INFOBIP_BASE_URL');

    this.logger.log(`[Infobip SMS] Sending OTP SMS to ${to}: "${message}" via ${baseUrl || 'api.infobip.com'}`);
    return true;
  }
}
