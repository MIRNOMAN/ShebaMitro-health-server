import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';
import { WinstonLoggingInterceptor } from './common/interceptors/winston-logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // ── Global Prefix ────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Security & Middleware (Helmet HTTP Headers) ─────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          scriptSrc: [`'self'`, `'unsafe-inline'`, `'unsafe-eval'`],
          styleSrc: [
            `'self'`,
            `'unsafe-inline'`,
            'https://fonts.googleapis.com',
          ],
          fontSrc: [`'self'`, 'https://fonts.gstatic.com', 'data:'],
          imgSrc: [`'self'`, 'data:', 'blob:', 'https:'],
          connectSrc: [`'self'`, 'https:', 'wss:', 'ws:'],
          objectSrc: [`'none'`],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // ── Strict CORS Configuration ───────────────────────────────
  const allowedOrigins =
    corsOrigin === '*'
      ? [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://shebamitro.health',
        ]
      : corsOrigin.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || corsOrigin === '*' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(`Origin ${origin} not allowed by strict CORS policy`),
        );
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Idempotency-Key',
      'X-Correlation-Id',
      'X-Request-Id',
    ],
    exposedHeaders: [
      'Content-Disposition',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Correlation-Id',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ── Global Pipes ─────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global Filters & Interceptors (Winston PHI/PII Masking) ──
  const reflector = app.get(Reflector);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new WinstonLoggingInterceptor(),
    new ApiResponseInterceptor(reflector),
  );

  // ── Swagger / OpenAPI Documentation at /docs ─────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle(
      'ShebaMitro Health - Institutional Digital Healthcare Platform API',
    )
    .setDescription(
      'Enterprise-grade Healthcare REST API compliant with HIPAA/GDPR PHI privacy principles, featuring End-to-End Telemedicine, Digital Prescriptions, AI Clinical Scribing, Chronic Refill Automation, and IoT Vitals Synchronization.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT access token (Bearer <token>)',
        in: 'header',
      },
      'BearerAuth',
    )
    .addTag(
      'Auth',
      'Authentication, User Registration, Session Management, and Role Validation',
    )
    .addTag(
      'Doctors',
      'Doctor Profiles, Chamber Availabilities, and Verification Status',
    )
    .addTag(
      'Appointments',
      'Consultation Bookings, Chamber Slots, and Status Workflows',
    )
    .addTag(
      'Chat',
      'Real-time Encrypted Doctor-Patient Messaging and Medical Attachments',
    )
    .addTag(
      'Alarms',
      'Medicine Dosage Schedules, Web Push Alarms, and Compliance Tracking',
    )
    .addTag(
      'Prescriptions',
      'Clinical Finalization, Drug-Drug Safety, and Cryptographic QR Signatures',
    )
    .addTag(
      'Labs',
      'Diagnostic Lab Directory, Home Sample Collection, and Encrypted Reports',
    )
    .addTag(
      'Refills',
      'Chronic Medicine Depletion Automation, 72h Reminders, and 1-Click Refill',
    )
    .addTag(
      'Pharmacy & Medicine Orders',
      'Pharmacy Partner Fulfillment, QR Verification, and Anti-Duplicate Dispense',
    )
    .addTag(
      'Payments & Billing',
      'bKash/Stripe Payment Gateway, Provider Wallets, and Escrow Payouts',
    )
    .addTag(
      'EHR & Medical Records',
      'Electronic Health Records, Chronic Biomarkers, and Timeline History',
    )
    .addTag(
      'Vitals Sync & Biometrics',
      'IoT Bluetooth Vitals Sync and Critical Emergency Alerts',
    )
    .addTag(
      'Emergency & Ambulance Dispatch',
      'Real-time Ambulance GPS Dispatch and Trauma Hospital Routing',
    )
    .addTag(
      'Family Members',
      'Dependent Profiles and Delegated Healthcare Management',
    )
    .addTag(
      'Clinical AI & Voice Scribe',
      'AI Voice Transcription, Clinical Summaries, and ICD-10 Coding',
    )
    .addTag(
      'Symptom Triage',
      'Rule-Based Patient Triage and Urgency Classification',
    )
    .addTag(
      'Report OCR',
      'AWS Textract Lab Report OCR and Biomarker Extraction',
    )
    .addTag(
      'Admin & Verification',
      'Institutional Verification, Provider BMDC Audits, and Compliance Logs',
    )
    .addServer(`http://localhost:${port}`, 'Local Development Server')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'ShebaMitro Health - API Documentation',
  });

  // Also setup at /api/docs for backward compatibility
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'ShebaMitro Health - API Documentation',
  });

  // ── Graceful Shutdown ────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Production Server running on http://localhost:${port}/api/v1`);
  logger.log(
    `📚 Swagger documentation available at http://localhost:${port}/docs`,
  );
  logger.log(
    `🔒 Security: Helmet, Strict CORS, Throttler Rate Limiting, and Winston PHI/PII Masking Active`,
  );
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

void bootstrap();
