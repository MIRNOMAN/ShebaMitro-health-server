import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import { WhatsAppService } from '../prescriptions/whatsapp.service.js';
import { WebPushService } from '../prescriptions/web-push.service.js';
import { ChronicRefillProcessor } from './chronic-refill.processor.js';
import { ChronicRefillJobPayload } from './chronic-refill.service.js';

describe('ChronicRefillProcessor', () => {
  let processor: ChronicRefillProcessor;
  let prisma: any;
  let whatsAppService: any;
  let webPushService: any;

  const mockPatientProfile = {
    id: 'patient-123',
    userId: 'user-123',
    user: {
      id: 'user-123',
      name: 'Anisul Huq',
      phone: '8801819000000',
      email: 'anisul@shebamitro.health',
    },
  };

  const mockJobPayload: ChronicRefillJobPayload = {
    prescriptionId: 'rx-chronic-500',
    prescriptionItemId: 'item-501',
    patientId: 'patient-123',
    medicineName: 'Metformin 500mg',
    genericName: 'Metformin',
    dosageForm: 'Tablet',
    durationDays: 30,
    depletionDate: '2026-10-31T00:00:00.000Z',
    scheduledReminderTime: '2026-10-28T00:00:00.000Z',
    reorderUrl:
      '/api/v1/pharmacy/refill-order?prescriptionId=rx-chronic-500&prescriptionItemId=item-501',
  };

  beforeEach(async () => {
    prisma = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
    };

    whatsAppService = {
      sendChronicRefillReminder: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'wa-123' }),
    };

    webPushService = {
      sendChronicRefillNotification: jest
        .fn()
        .mockResolvedValue({ success: true, endpoint: 'fcm://...' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChronicRefillProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsAppService },
        { provide: WebPushService, useValue: webPushService },
      ],
    }).compile();

    processor = module.get<ChronicRefillProcessor>(ChronicRefillProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process send-chronic-refill-reminder job and dispatch WhatsApp and Push notifications', async () => {
    const mockJob: any = {
      id: 'chronic-refill-rx-chronic-500-item-501',
      name: 'send-chronic-refill-reminder',
      data: mockJobPayload,
    };

    const result = await processor.process(mockJob);

    expect(result.status).toBe('REFILL_REMINDERS_SENT');
    expect(result.prescriptionId).toBe('rx-chronic-500');
    expect(result.medicineName).toBe('Metformin 500mg');

    expect(whatsAppService.sendChronicRefillReminder).toHaveBeenCalledWith({
      patientPhone: '8801819000000',
      patientName: 'Anisul Huq',
      medicineName: 'Metformin 500mg',
      depletionDate: '2026-10-31T00:00:00.000Z',
      prescriptionId: 'rx-chronic-500',
      reorderUrl: mockJobPayload.reorderUrl,
    });

    expect(webPushService.sendChronicRefillNotification).toHaveBeenCalledWith(
      'patient-123',
      {
        patientId: 'patient-123',
        prescriptionId: 'rx-chronic-500',
        medicineName: 'Metformin 500mg',
        depletionDate: '2026-10-31T00:00:00.000Z',
        reorderEndpoint: '/api/v1/pharmacy/refill-order',
      },
    );
  });

  it('should ignore unrecognized job names gracefully', async () => {
    const mockJob: any = {
      id: 'other-job-1',
      name: 'some-other-job',
      data: mockJobPayload,
    };

    const result = await processor.process(mockJob);
    expect(result.status).toBe('IGNORED');
  });
});
