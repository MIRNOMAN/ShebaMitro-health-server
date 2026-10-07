import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module.js';
import { RedisModule } from '../../common/redis/redis.module.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { TwilioSmsAdapter } from './adapters/twilio-sms.adapter.js';
import { InfobipSmsAdapter } from './adapters/infobip-sms.adapter.js';
import { SslWirelessSmsAdapter } from './adapters/ssl-wireless-sms.adapter.js';
import { MockSmsAdapter } from './adapters/mock-sms.adapter.js';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [OtpController],
  providers: [
    OtpService,
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
        const provider =
          configService.get<string>('SMS_PROVIDER')?.toUpperCase() || 'MOCK';
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
  exports: [OtpService],
})
export class OtpModule {}
