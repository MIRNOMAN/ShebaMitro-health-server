import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ReminderStatus } from '@prisma/client';
import {
  RemindersQueueService,
  RemindersProcessor,
  MEDICINE_REMINDERS_QUEUE,
} from './reminders-queue.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { WebPushService } from './web-push.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { AudioReminderService } from './audio-reminder.service.js';

describe('RemindersQueueService & RemindersProcessor', () => {
  let queueService: RemindersQueueService;
  let processor: RemindersProcessor;
  let mockQueue: any;
  let prismaService: any;
  let webPushService: any;
  let whatsAppService: any;
  let audioReminderService: any;

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

    prismaService = {
      medicineReminder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rem-abc-123',
          patientId: 'patient-789',
          intakeTime: new Date(),
          status: ReminderStatus.PENDING,
          prescriptionItem: {
            medicineName: 'Napa Extra',
            schedulePattern: '1+0+1',
            prescription: { diagnosis: 'Fever and headache' },
          },
          patient: {
            user: {
              name: 'Abdul',
              phone: '8801700000000',
            },
          },
        }),
      },
    };

    webPushService = {
      sendAlarmNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    whatsAppService = {
      sendFallbackTemplateMessage: jest.fn().mockResolvedValue({ success: true }),
    };

    audioReminderService = {
      processAudioReminder: jest.fn().mockResolvedValue({
        reminderId: 'rem-abc-123',
        voiceNoteSent: true,
        ivrCallTriggered: false,
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
        { provide: PrismaService, useValue: prismaService },
        { provide: WebPushService, useValue: webPushService },
        { provide: WhatsAppService, useValue: whatsAppService },
        { provide: AudioReminderService, useValue: audioReminderService },
      ],
    }).compile();

    queueService = module.get<RemindersQueueService>(RemindersQueueService);
    processor = module.get<RemindersProcessor>(RemindersProcessor);
  });

  it('should be defined', () => {
    expect(queueService).toBeDefined();
    expect(processor).toBeDefined();
  });

  describe('addReminderJob & addFallbackCheckJob', () => {
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

    it('should add a 15-minute fallback job with format "fallback-${reminderId}"', async () => {
      const payload = {
        reminderId: 'rem-abc-123',
        patientId: 'patient-789',
        prescriptionItemId: 'item-456',
        intakeTime: new Date(),
      };

      const job = await queueService.addFallbackCheckJob(payload, 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-fallback-whatsapp',
        payload,
        expect.objectContaining({
          jobId: 'fallback-rem-abc-123',
          delay: 900000,
          removeOnComplete: true,
        }),
      );
      expect(job.id).toBe('fallback-rem-abc-123');
    });
  });

  describe('RemindersProcessor', () => {
    it('should trigger Web Push notification with alarm sound tag and schedule 15-minute fallback check on alarm job', async () => {
      const mockJob = {
        id: 'reminder-rem-abc-123',
        name: 'send-reminder',
        data: {
          reminderId: 'rem-abc-123',
          patientId: 'patient-789',
          prescriptionItemId: 'item-456',
          intakeTime: new Date(),
        },
      } as any;

      const result = await processor.process(mockJob);

      expect(webPushService.sendAlarmNotification).toHaveBeenCalledWith(
        'patient-789',
        expect.objectContaining({
          reminderId: 'rem-abc-123',
          medicineName: 'Napa Extra',
        }),
      );

      // Verify 15-minute fallback job scheduling was triggered
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-fallback-whatsapp',
        mockJob.data,
        expect.objectContaining({
          jobId: 'fallback-rem-abc-123',
          delay: 900000,
        }),
      );

      expect(result.status).toBe('ALARM_PUSH_SENT');
    });

    it('should trigger Meta Cloud API WhatsApp fallback template message when reminder is unacknowledged after 15 minutes', async () => {
      const mockFallbackJob = {
        id: 'fallback-rem-abc-123',
        name: 'check-fallback-whatsapp',
        data: {
          reminderId: 'rem-abc-123',
          patientId: 'patient-789',
          prescriptionItemId: 'item-456',
          intakeTime: new Date(),
        },
      } as any;

      const result = await processor.process(mockFallbackJob);

      expect(whatsAppService.sendFallbackTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderId: 'rem-abc-123',
          patientName: 'Abdul',
          patientPhone: '8801700000000',
          medicineName: 'Napa Extra',
        }),
      );

      expect(result.status).toBe('WHATSAPP_FALLBACK_TRIGGERED');
    });

    it('should NOT trigger WhatsApp fallback if reminder was already TAKEN or SKIPPED', async () => {
      prismaService.medicineReminder.findUnique.mockResolvedValueOnce({
        id: 'rem-abc-123',
        status: ReminderStatus.TAKEN,
      });

      const mockFallbackJob = {
        id: 'fallback-rem-abc-123',
        name: 'check-fallback-whatsapp',
        data: {
          reminderId: 'rem-abc-123',
          patientId: 'patient-789',
          prescriptionItemId: 'item-456',
          intakeTime: new Date(),
        },
      } as any;

      const result = await processor.process(mockFallbackJob);

      expect(whatsAppService.sendFallbackTemplateMessage).not.toHaveBeenCalled();
      expect(result.status).toBe('ALREADY_ACKNOWLEDGED');
    });
  });
});
