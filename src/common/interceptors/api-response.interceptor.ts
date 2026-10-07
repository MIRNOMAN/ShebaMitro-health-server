import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator.js';

export interface ApiResponseEnvelope<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  timestamp: string;
}

/**
 * Centralized API Response Interceptor.
 * Transforms successful controller outputs into standard response envelope:
 * { success: true, statusCode, data, message, timestamp }
 */
@Injectable()
export class ApiResponseInterceptor<T = unknown> implements NestInterceptor<
  T,
  ApiResponseEnvelope<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseEnvelope<T>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const statusCode = response.statusCode;

    // Retrieve custom message set via @ResponseMessage() decorator
    const customMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data: T) => {
        let payload: any = data;
        let message = customMessage || 'Operation completed successfully';

        // Check if controller returned object containing custom message/data overrides
        if (
          data &&
          typeof data === 'object' &&
          !Array.isArray(data) &&
          ('data' in data || 'message' in data)
        ) {
          const raw = data as Record<string, any>;
          if ('message' in raw && typeof raw.message === 'string') {
            message = raw.message;
          }
          if ('data' in raw) {
            payload = raw.data;
          }
        }

        return {
          success: true,
          statusCode,
          message,
          data: payload ?? null,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
