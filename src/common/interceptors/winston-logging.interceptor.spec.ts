import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { WinstonLoggingInterceptor } from './winston-logging.interceptor.js';
import {
  maskPhiPii,
  maskEmail,
  maskPhone,
  maskCardNumber,
} from '../logger/phi-masker.util.js';
import { winstonLoggerInstance } from '../logger/winston.logger.js';

describe('WinstonLoggingInterceptor & PHI/PII Masker', () => {
  let interceptor: WinstonLoggingInterceptor;
  let winstonInfoSpy: jest.SpyInstance;
  let winstonErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new WinstonLoggingInterceptor();
    winstonInfoSpy = jest
      .spyOn(winstonLoggerInstance, 'info')
      .mockImplementation(() => winstonLoggerInstance);
    winstonErrorSpy = jest
      .spyOn(winstonLoggerInstance, 'error')
      .mockImplementation(() => winstonLoggerInstance);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PHI/PII Masking Utilities', () => {
    it('should mask email addresses correctly', () => {
      expect(maskEmail('patient@shebamitro.health')).toBe(
        'p***t@shebamitro.health',
      );
      expect(maskEmail('dr@hospital.com')).toBe('d*@hospital.com');
    });

    it('should mask phone numbers correctly', () => {
      expect(maskPhone('8801712345678')).toBe('8801****5678');
      expect(maskPhone('+8801819000000')).toBe('+88018****0000');
    });

    it('should mask credit card numbers correctly', () => {
      expect(maskCardNumber('4111222233334444')).toBe('4111-****-****-4444');
    });

    it('should recursively mask sensitive keys in objects and arrays', () => {
      const sensitivePayload = {
        name: 'Abdul Karim',
        email: 'abdul@example.com',
        phone: '8801711223344',
        password: 'SuperSecretPassword123!',
        refreshToken: 'refresh-token-xyz-123',
        vitalsJson: { bp: '120/80', pulse: 72 },
        medicalAllergies: ['Penicillin', 'Sulfa'],
        diagnosis: 'Type 2 Diabetes',
        items: [{ medicineName: 'Metformin', cardNumber: '4111222233334444' }],
      };

      const masked = maskPhiPii(sensitivePayload);

      expect(masked.password).toBe('[REDACTED_PHI_PII]');
      expect(masked.refreshToken).toBe('[REDACTED_PHI_PII]');
      expect(masked.vitalsJson).toBe('[REDACTED_PHI_PII]');
      expect(masked.medicalAllergies).toBe('[REDACTED_PHI_PII]');
      expect(masked.diagnosis).toBe('[REDACTED_PHI_PII]');
      expect(masked.email).toBe('a***l@example.com');
      expect(masked.phone).toBe('8801****3344');
      expect(masked.items[0].cardNumber).toBe('[REDACTED_PHI_PII]');
      expect(masked.items[0].medicineName).toBe('Metformin');
    });
  });

  describe('WinstonLoggingInterceptor', () => {
    it('should log incoming request and outgoing response with masked PHI/PII', (done) => {
      const mockRequest: any = {
        method: 'POST',
        originalUrl: '/api/v1/auth/login',
        url: '/api/v1/auth/login',
        ip: '127.0.0.1',
        headers: {
          'x-correlation-id': 'test-corr-123',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIs...',
          'content-type': 'application/json',
        },
        body: {
          email: 'user@shebamitro.health',
          password: 'SecretPassword999!',
        },
        query: {},
      };

      const mockResponse: any = {
        statusCode: 200,
      };

      const mockExecutionContext: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
          getNext: jest.fn(),
        }),
      } as any;

      const mockCallHandler: CallHandler = {
        handle: () =>
          of({
            accessToken: 'token-abc',
            user: { email: 'user@shebamitro.health', phone: '8801700000000' },
          }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (result) => {
          expect(result).toBeDefined();
          expect(winstonInfoSpy).toHaveBeenCalledTimes(2);

          // Verify request logged with masked password and token
          expect(winstonInfoSpy).toHaveBeenCalledWith(
            'Incoming Request: POST /api/v1/auth/login',
            expect.objectContaining({
              correlationId: 'test-corr-123',
              body: expect.objectContaining({
                password: '[REDACTED_PHI_PII]',
                email: 'u***r@shebamitro.health',
              }),
              headers: expect.objectContaining({
                authorization: 'Bearer [REDACTED_JWT_TOKEN]',
              }),
            }),
          );

          // Verify response logged with masked email/phone
          expect(winstonInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining(
              'Completed Response: POST /api/v1/auth/login [200]',
            ),
            expect.objectContaining({
              correlationId: 'test-corr-123',
              statusCode: 200,
              response: expect.objectContaining({
                user: expect.objectContaining({
                  email: 'u***r@shebamitro.health',
                  phone: '8801****0000',
                }),
              }),
            }),
          );

          done();
        },
      });
    });

    it('should log failed request error with masked details', (done) => {
      const mockRequest: any = {
        method: 'GET',
        originalUrl: '/api/v1/prescriptions/invalid-id',
        url: '/api/v1/prescriptions/invalid-id',
        ip: '127.0.0.1',
        headers: {},
        body: undefined,
        query: {},
      };

      const mockResponse: any = {
        statusCode: 404,
      };

      const mockExecutionContext: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
          getNext: jest.fn(),
        }),
      } as any;

      const mockError = new Error('Prescription not found');
      (mockError as any).status = 404;

      const mockCallHandler: CallHandler = {
        handle: () => throwError(() => mockError),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: (err) => {
          expect(err).toBe(mockError);
          expect(winstonErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(
              'Failed Request: GET /api/v1/prescriptions/invalid-id [404]',
            ),
            expect.objectContaining({
              statusCode: 404,
              error: expect.objectContaining({
                message: 'Prescription not found',
              }),
            }),
          );
          done();
        },
      });
    });
  });
});
