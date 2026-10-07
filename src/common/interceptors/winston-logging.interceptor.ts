import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { winstonLoggerInstance } from '../logger/winston.logger.js';
import { maskPhiPii } from '../logger/phi-masker.util.js';

/**
 * Global Winston Logging Interceptor that automatically masks all Protected Health
 * Information (PHI) and Personally Identifiable Information (PII) from request headers,
 * query parameters, body payloads, and response data.
 */
@Injectable()
export class WinstonLoggingInterceptor implements NestInterceptor {
  private readonly winston = winstonLoggerInstance;
  private readonly nestLogger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const { method, originalUrl, url, ip, headers, body, query } = request;
    const reqUrl = originalUrl || url;
    const startTime = Date.now();
    const correlationId =
      (headers['x-correlation-id'] as string) ||
      (headers['x-request-id'] as string) ||
      `req-${Date.now()}`;

    // Mask sensitive PHI/PII in headers, body, and query parameters
    const maskedBody = body ? maskPhiPii(body) : undefined;
    const maskedQuery = query ? maskPhiPii(query) : undefined;
    const maskedHeaders = {
      ...headers,
      authorization: headers.authorization
        ? 'Bearer [REDACTED_JWT_TOKEN]'
        : undefined,
      cookie: headers.cookie ? '[REDACTED_COOKIE]' : undefined,
    };

    this.winston.info(`Incoming Request: ${method} ${reqUrl}`, {
      context: 'WinstonLoggingInterceptor',
      correlationId,
      method,
      url: reqUrl,
      ip,
      headers: maskedHeaders,
      query: maskedQuery,
      body: maskedBody,
    });

    return next.handle().pipe(
      tap({
        next: (resData: any) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 200;
          const maskedResData = resData ? maskPhiPii(resData) : undefined;

          this.winston.info(
            `Completed Response: ${method} ${reqUrl} [${statusCode}] — ${duration}ms`,
            {
              context: 'WinstonLoggingInterceptor',
              correlationId,
              method,
              url: reqUrl,
              statusCode,
              durationMs: duration,
              response: maskedResData,
            },
          );

          this.nestLogger.log(
            `${method} ${reqUrl} ${statusCode} — ${duration}ms`,
          );
        },
        error: (err: any) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || err.statusCode || 500;

          this.winston.error(
            `Failed Request: ${method} ${reqUrl} [${statusCode}] — ${duration}ms — Error: ${err.message}`,
            {
              context: 'WinstonLoggingInterceptor',
              correlationId,
              method,
              url: reqUrl,
              statusCode,
              durationMs: duration,
              error: {
                message: err.message,
                name: err.name,
                stack: err.stack,
              },
            },
          );

          this.nestLogger.error(
            `${method} ${reqUrl} ${statusCode} — ${duration}ms — ${err.message}`,
          );
        },
      }),
    );
  }
}
