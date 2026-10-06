import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  redisConfig,
  awsConfig,
  validateEnv,
} from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OtpModule } from './modules/otp/otp.module.js';
import { DoctorModule } from './modules/doctors/doctors.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TeleconsultModule } from './modules/teleconsult/teleconsult.module.js';
import { PrescriptionModule } from './modules/prescriptions/prescriptions.module.js';
import { LabModule } from './modules/labs/labs.module.js';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module.js';
import { PaymentModule } from './modules/payments/payments.module.js';
import { EhrModule } from './modules/ehr/ehr.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { SymptomTriageModule } from './modules/symptom-triage/symptom-triage.module.js';
import { ClinicalAiModule } from './modules/clinical-ai/clinical-ai.module.js';
import { PaginationModule } from './common/pagination/pagination.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';

@Module({
  imports: [
    // ── Configuration with Zod Validation ───────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, awsConfig],
    }),

    // ── BullMQ Queue Configuration ──────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') || '127.0.0.1',
          port: configService.get<number>('redis.port') || 6379,
        },
      }),
    }),

    // ── Event Emitter ───────────────────────────────────────────
    EventEmitterModule.forRoot(),

    // ── Database & Global Common Modules ────────────────────────
    DatabaseModule,
    PaginationModule,

    // ── Feature Modules ──────────────────────────────────────────
    AuthModule,
    UsersModule,
    HealthModule,
    OtpModule,
    DoctorModule,
    AppointmentsModule,
    ChatModule,
    TeleconsultModule,
    PrescriptionModule,
    LabModule,
    PharmacyModule,
    PaymentModule,
    EhrModule,
    AdminModule,
    SymptomTriageModule,
    ClinicalAiModule,
  ],
  providers: [
    // Global ValidationPipe: strict DTO filtering and implicit type transformation
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    },
    // Global Centralized Exception Filter formatting errors to RFC 7807 Problem Details
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global API Response Interceptor producing standard JSON envelope
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
    // Global JWT Auth Guard (routes are protected by default unless marked @Public())
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
