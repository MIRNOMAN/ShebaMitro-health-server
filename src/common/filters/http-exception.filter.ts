import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Interface representing RFC 7807 Problem Details schema.
 */
export interface Rfc7807ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  timestamp: string;
  invalidParams?: Array<{ field?: string; message: string }> | string[];
}

/**
 * Centralized HTTP exception filter implementing RFC 7807 Problem Details standard.
 * Formats all exceptions (4xx, 5xx, and unhandled errors) into standard RFC 7807 JSON envelope.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected internal server error occurred';
    let invalidParams:
      Array<{ field?: string; message: string }> | string[] | undefined =
      undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      title = this.getHttpStatusTitle(status);

      if (typeof exceptionResponse === 'string') {
        detail = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as Record<string, any>;

        if (Array.isArray(resObj.message)) {
          detail = 'Request validation failed';
          invalidParams = resObj.message;
        } else if (typeof resObj.message === 'string') {
          detail = resObj.message;
        } else {
          detail = exception.message;
        }

        if (resObj.error && typeof resObj.error === 'string') {
          title = resObj.error;
        }
      } else {
        detail = exception.message;
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const problemDetails: Rfc7807ProblemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
      ...(invalidParams && { invalidParams }),
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status} - ${detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${detail}`,
      );
    }

    response
      .status(status)
      .setHeader('Content-Type', 'application/problem+json')
      .json(problemDetails);
  }

  private getHttpStatusTitle(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.METHOD_NOT_ALLOWED:
        return 'Method Not Allowed';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      default:
        return 'HTTP Exception';
    }
  }
}
