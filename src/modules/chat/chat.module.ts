import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module.js';
import { PaginationModule } from '../../common/pagination/pagination.module.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PaginationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, S3Service],
  exports: [ChatGateway, ChatService, S3Service],
})
export class ChatModule {}
