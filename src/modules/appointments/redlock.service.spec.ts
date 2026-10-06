import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RedlockService } from './redlock.service.js';
import { RedisService } from '../../common/redis/redis.service.js';

describe('RedlockService', () => {
  let service: RedlockService;
  let redisService: any;

  beforeEach(async () => {
    redisService = {
      getRawClient: jest.fn().mockReturnValue(null), // Fallback mode
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedlockService,
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<RedlockService>(RedlockService);
  });

  it('should acquire and release an in-memory lock key lock:doctor:{doctorId}:slot:{slotTime}', async () => {
    const lock = await service.acquireDoctorSlotLock(
      'doc-1',
      '2026-10-10T10:00:00.000Z',
    );

    expect(lock).toBeDefined();
    expect(typeof lock.release).toBe('function');

    // Attempting to lock the exact same key concurrently should throw ConflictException
    await expect(
      service.acquireDoctorSlotLock('doc-1', '2026-10-10T10:00:00.000Z'),
    ).rejects.toThrow(ConflictException);

    // Release lock
    await lock.release();

    // Now acquiring lock again should succeed
    const newLock = await service.acquireDoctorSlotLock(
      'doc-1',
      '2026-10-10T10:00:00.000Z',
    );
    expect(newLock).toBeDefined();
    await newLock.release();
  });
});
