import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  RemindersQueueService,
  RemindersProcessor,
  MEDICINE_REMINDERS_QUEUE,
} from './reminders-queue.service.js';

describe('RemindersQueueService & RemindersProcessor', () => {
  let queueService: RemindersQueueService;
  let processor: RemindersProcessor;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockImplementation((name, data, opts) => {
        return Promise.resolve({
          id: opts.jobId,
          name,
          data,
          opts,
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersQueueService,
        RemindersProcessor,
        {
          provide: getQueueToken(MEDICINE_REMINDERS_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    queueService = module.get<RemindersQueueService>(RemindersQueueService);
    processor = module.get<RemindersProcessor>(RemindersProcessor);
  });

  it('should be defined', () => {
    expect(queueService).toBeDefined();
    expect(processor).toBeDefined();
  });

  describe('addReminderJob', () => {
    it('should add a delayed job with unique jobId format "reminder-${reminderId}"', async () => {
      const intakeTime = new Date(Date.now() + 60000); // 1 minute in future
      const payload = {
        reminderId: 'rem-abc-123',
        patientId: 'patient-789',
        prescriptionItemId: 'item-456',
        intakeTime,
      };

      const job = await queueService.addReminderJob(payload);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        payload,
        expect.objectContaining({
          jobId: 'reminder-rem-abc-123',
          removeOnComplete: true,
          attempts: 3,
        }),
      );
      expect(job.id).toBe('reminder-rem-abc-123');
    });
  });

  describe('RemindersProcessor', () => {
    it('should process reminder job successfully', async () => {
      const mockJobPayload = {
        id: 'reminder-rem-abc-123',
        data: {
          reminderId: 'rem-abc-123',
          patientId: 'patient-789',
          prescriptionItemId: 'item-456',
          intakeTime: new Date(),
        },
      } as any;

      const result = await processor.process(mockJobPayload);

      expect(result.status).toBe('SENT');
      expect(result.reminderId).toBe('rem-abc-123');
      expect(result.processedAt).toBeDefined();
    });
  });
});
