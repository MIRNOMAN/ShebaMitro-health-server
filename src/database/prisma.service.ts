import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Enterprise PrismaService with connection pooling and automatic soft-delete middleware.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });

    if (typeof (this as any).$use === 'function') {
      this.setupLegacyMiddleware();
    }
  }

  private setupLegacyMiddleware(): void {
    (this as any).$use(
      async (params: any, next: (params: any) => Promise<any>) => {
        if (
          params.action === 'findUnique' ||
          params.action === 'findFirst' ||
          params.action === 'findMany' ||
          params.action === 'count'
        ) {
          if (params.action === 'findUnique') {
            params.action = 'findFirst';
          }
          if (!params.args) {
            params.args = {};
          }
          if (!params.args.where) {
            params.args.where = {};
          }

          if (params.args.where.deletedAt === undefined) {
            params.args.where.deletedAt = null;
          }
        }

        if (params.action === 'delete') {
          params.action = 'update';
          params.args['data'] = { deletedAt: new Date() };
        }

        if (params.action === 'deleteMany') {
          params.action = 'updateMany';
          if (params.args.data !== undefined) {
            params.args.data['deletedAt'] = new Date();
          } else {
            params.args['data'] = { deletedAt: new Date() };
          }
        }

        return next(params);
      },
    );
  }

  /**
   * Automatic soft-delete helper method.
   */
  async softDelete(modelName: string, id: string): Promise<any> {
    const model = (this as any)[modelName];
    if (model && typeof model.update === 'function') {
      return model.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(
      'PrismaService connected to PostgreSQL database connection pool',
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PrismaService gracefully disconnected from database');
  }
}
