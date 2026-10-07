import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { RedisModule } from '../../common/redis/redis.module.js';
import { EmergencyController } from './emergency.controller.js';
import { EmergencyService } from './emergency.service.js';
import { EmergencyGateway } from './emergency.gateway.js';
import { TwilioSmsAdapter } from '../otp/adapters/twilio-sms.adapter.js';
import { InfobipSmsAdapter } from '../otp/adapters/infobip-sms.adapter.js';
import { SslWirelessSmsAdapter } from '../otp/adapters/ssl-wireless-sms.adapter.js';
import { MockSmsAdapter } from '../otp/adapters/mock-sms.adapter.js';

@Module({
  imports: [DatabaseModule, RedisModule, ConfigModule],
  controllers: [EmergencyController],
  providers: [
    EmergencyService,
    EmergencyGateway,
    TwilioSmsAdapter,
    InfobipSmsAdapter,
    SslWirelessSmsAdapter,
    MockSmsAdapter,
    {
      provide: 'SMS_ADAPTER',
      useFactory: (
        configService: ConfigService,
        twilio: TwilioSmsAdapter,
        infobip: InfobipSmsAdapter,
        sslWireless: SslWirelessSmsAdapter,
        mock: MockSmsAdapter,
      ) => {
        const provider = configService.get<string>('SMS_PROVIDER')?.toUpperCase() || 'MOCK';
        switch (provider) {
          case 'TWILIO':
            return twilio;
          case 'INFOBIP':
            return infobip;
          case 'SSL_WIRELESS':
            return sslWireless;
          default:
            return mock;
        }
      },
      inject: [
        ConfigService,
        TwilioSmsAdapter,
        InfobipSmsAdapter,
        SslWirelessSmsAdapter,
        MockSmsAdapter,
      ],
    },
  ],
  exports: [EmergencyService, EmergencyGateway],
})
export class EmergencyModule {}
