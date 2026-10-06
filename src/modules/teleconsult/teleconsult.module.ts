import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module.js';
import { TeleconsultController } from './teleconsult.controller.js';
import { TeleconsultService } from './teleconsult.service.js';
import { TeleconsultGateway } from './teleconsult.gateway.js';

@Module({
  imports: [
    DatabaseModule,
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
  controllers: [TeleconsultController],
  providers: [TeleconsultService, TeleconsultGateway],
  exports: [TeleconsultService, TeleconsultGateway],
})
export class TeleconsultModule {}
