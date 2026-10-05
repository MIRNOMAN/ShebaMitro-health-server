import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsAdapter } from './sms-adapter.interface.js';

@Injectable()
export class SslWirelessSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(SslWirelessSmsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async sendSms(to: string, message: string): Promise<boolean> {
    const apiToken = this.configService.get<string>('SSL_WIRELESS_API_TOKEN');
    const sid = this.configService.get<string>('SSL_WIRELESS_SID');

    this.logger.log(
      `[SSL Wireless SMS] Sending OTP SMS to ${to}: "${message}" (SID: ${sid || 'mock'})`,
    );
    return true;
  }
}
