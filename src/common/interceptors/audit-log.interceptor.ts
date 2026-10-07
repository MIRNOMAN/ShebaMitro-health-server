import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, url, user, params, query, body, ip, headers } =
      request;

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      method.toUpperCase(),
    );

    if (!isMutation) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          try {
            const adminUserId = user?.id || user?.userId || user?.sub || null;
            const action = `${method.toUpperCase()} ${originalUrl || url}`;
            const targetId = params?.id || body?.id || body?.providerId || null;
            let targetType = 'ADMIN_MUTATION';
            const endpointPath = originalUrl || url || '';

            if (endpointPath.includes('verify-provider')) {
              targetType = 'PROVIDER_VERIFICATION';
            } else if (endpointPath.includes('payouts')) {
              targetType = 'PAYOUT_DISBURSEMENT';
            }

            const sanitizedBody =
              body && typeof body === 'object' ? { ...body } : body;

            await this.prisma.auditLog.create({
              data: {
                adminUserId: adminUserId ? String(adminUserId) : null,
                action,
                targetType,
                targetId: targetId ? String(targetId) : null,
                detailsJson: {
                  params,
                  query,
                  body: sanitizedBody,
                  responseSummary: responseBody ? { success: true } : null,
                },
                ipAddress:
                  typeof ip === 'string'
                    ? ip
                    : (headers?.['x-forwarded-for'] as string) ||
                      request.socket?.remoteAddress ||
                      null,
              },
            });
          } catch (err: any) {
            this.logger.error(
              `Failed to record AuditLog: ${err.message}`,
              err.stack,
            );
          }
        },
      }),
    );
  }
}
