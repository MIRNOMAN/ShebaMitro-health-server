import { Injectable, Logger, ConflictException } from '@nestjs/common';
import Redlock, { Lock } from 'redlock';
import { RedisService } from '../../common/redis/redis.service.js';

export interface LockHandle {
  release: () => Promise<void>;
}

@Injectable()
export class RedlockService {
  private readonly logger = new Logger(RedlockService.name);
  private redlock: Redlock | null = null;
  private readonly fallbackLocks = new Set<string>();

  constructor(private readonly redisService: RedisService) {}

  private getRedlock(): Redlock | null {
    if (this.redlock) return this.redlock;

    const redisClient = this.redisService.getRawClient();
    if (redisClient) {
      try {
        this.redlock = new Redlock([redisClient as any], {
          driftFactor: 0.01,
          retryCount: 3,
          retryDelay: 200,
          retryJitter: 200,
          automaticExtensionThreshold: 500,
        });
        return this.redlock;
      } catch (err: any) {
        this.logger.warn(
          `Failed to instantiate Redlock client: ${err.message}`,
        );
      }
    }
    return null;
  }

  /**
   * Acquire distributed lock using Redlock key "lock:doctor:{doctorId}:slot:{slotTime}"
   */
  async acquireDoctorSlotLock(
    doctorId: string,
    slotTime: string,
    ttlMs: number = 5000,
  ): Promise<LockHandle> {
    const lockKey = `lock:doctor:${doctorId}:slot:${slotTime}`;
    const redlock = this.getRedlock();

    if (redlock) {
      try {
        const lock: Lock = await redlock.acquire([lockKey], ttlMs);
        this.logger.log(`Acquired Redlock lock on key: ${lockKey}`);
        return {
          release: async () => {
            try {
              await redlock.release(lock);
              this.logger.log(`Released Redlock lock on key: ${lockKey}`);
            } catch (err: any) {
              this.logger.warn(
                `Error releasing Redlock lock ${lockKey}: ${err.message}`,
              );
            }
          },
        };
      } catch (err: any) {
        this.logger.warn(
          `Redlock acquisition failed for key ${lockKey}: ${err.message}`,
        );
        throw new ConflictException(
          `Slot is currently locked by another booking request. Please try again.`,
        );
      }
    }

    // In-memory fallback lock (when Redis server is unavailable or in memory fallback mode)
    if (this.fallbackLocks.has(lockKey)) {
      throw new ConflictException(
        `Slot is currently locked by another booking request. Please try again.`,
      );
    }

    this.fallbackLocks.add(lockKey);
    this.logger.log(`Acquired in-memory fallback lock on key: ${lockKey}`);

    const timer = setTimeout(() => {
      this.fallbackLocks.delete(lockKey);
    }, ttlMs);

    return {
      release: async () => {
        clearTimeout(timer);
        this.fallbackLocks.delete(lockKey);
        this.logger.log(`Released in-memory fallback lock on key: ${lockKey}`);
      },
    };
  }
}
