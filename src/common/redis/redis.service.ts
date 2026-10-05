import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient!: Redis;
  private isMemoryFallback = false;
  private readonly memoryStore = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    try {
      this.redisClient = new Redis({
        host,
        port,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection retries exhausted. Activating in-memory fallback store.');
            this.isMemoryFallback = true;
            return null; // Stop retrying
          }
          return Math.min(times * 100, 2000);
        },
        lazyConnect: true,
      });

      this.redisClient.connect().catch((err) => {
        this.logger.warn(`Redis client connect failed: ${err.message}. Using in-memory store.`);
        this.isMemoryFallback = true;
      });
    } catch (err) {
      this.logger.warn(`Failed to initialize Redis client. Using fallback. ${err}`);
      this.isMemoryFallback = true;
    }
  }

  onModuleDestroy() {
    if (this.redisClient && !this.isMemoryFallback) {
      this.redisClient.disconnect();
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMemoryFallback) {
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
      this.memoryStore.set(key, { value, expiresAt });
      return;
    }

    try {
      if (ttlSeconds) {
        await this.redisClient.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redisClient.set(key, value);
      }
    } catch (err) {
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
      this.memoryStore.set(key, { value, expiresAt });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isMemoryFallback) {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }

    try {
      return await this.redisClient.get(key);
    } catch {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }
  }

  async del(key: string): Promise<void> {
    this.memoryStore.delete(key);
    if (!this.isMemoryFallback) {
      try {
        await this.redisClient.del(key);
      } catch {
        // ignore
      }
    }
  }

  async incr(key: string, ttlSecondsOnFirstIncr?: number): Promise<number> {
    const currentVal = await this.get(key);
    const count = currentVal ? parseInt(currentVal, 10) + 1 : 1;

    let ttl = ttlSecondsOnFirstIncr;
    if (this.isMemoryFallback) {
      const item = this.memoryStore.get(key);
      if (item && item.expiresAt > Date.now()) {
        ttl = Math.ceil((item.expiresAt - Date.now()) / 1000);
      }
    }

    await this.set(key, count.toString(), ttl);
    return count;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isMemoryFallback) {
      const item = this.memoryStore.get(key);
      if (item) {
        item.expiresAt = Date.now() + ttlSeconds * 1000;
      }
      return;
    }

    try {
      await this.redisClient.expire(key, ttlSeconds);
    } catch {
      const item = this.memoryStore.get(key);
      if (item) {
        item.expiresAt = Date.now() + ttlSeconds * 1000;
      }
    }
  }

  async ttl(key: string): Promise<number> {
    if (this.isMemoryFallback) {
      const item = this.memoryStore.get(key);
      if (!item) return -2;
      if (item.expiresAt === Infinity) return -1;
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }

    try {
      return await this.redisClient.ttl(key);
    } catch {
      const item = this.memoryStore.get(key);
      if (!item) return -2;
      if (item.expiresAt === Infinity) return -1;
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }
  }
}
