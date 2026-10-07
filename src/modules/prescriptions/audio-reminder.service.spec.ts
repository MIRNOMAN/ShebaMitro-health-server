import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../common/storage/s3.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { AudioReminderService } from './audio-reminder.service.js';

describe('AudioReminderService', () => {
  let service: AudioReminderService;
  let s3Service: any;
  let whatsAppService: any;
  let configService: any;

  beforeEach(async () => {
    s3Service = {
      uploadBuffer: jest.fn().mockImplementation((buffer, key, contentType) =>
        Promise.resolve({
          key,
          fileUrl: `https://mock-s3.shebamitro.health/${key}`,
          presignedUrl: `https://mock-s3.shebamitro.health/${key}?token=presigned123`,
          size: buffer.length,
          mimeType: contentType,
        }),
      ),
    };

    whatsAppService = {
      sendVoiceNote: jest.fn().mockResolvedValue({ success: true, audioUrl: 'https://mock-s3.shebamitro.health/audio.mp3' }),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: string) => {
        if (key === 'GOOGLE_TTS_API_KEY') return 'mock-google-tts-key';
        if (key === 'TWILIO_ACCOUNT_SID') return process.env.TWILIO_ACCOUNT_SID || 'mock-twilio-account-sid';
        if (key === 'TWILIO_AUTH_TOKEN') return process.env.TWILIO_AUTH_TOKEN || 'mock-twilio-auth-token';
        if (key === 'TWILIO_FROM_PHONE') return process.env.TWILIO_FROM_PHONE || '+18005550199';
        return defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioReminderService,
        { provide: S3Service, useValue: s3Service },
        { provide: WhatsAppService, useValue: whatsAppService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AudioReminderService>(AudioReminderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatBengaliReminderText', () => {
    it('should format natural Bengali reminder text for diabetes diagnosis and Metformin', () => {
      const text = service.formatBengaliReminderText({
        patientName: 'করিম সাহেব',
        medicineName: 'মেটফরমিন',
        diagnosis: 'Type 2 Diabetes Mellitus',
      });

      expect(text).toContain('করিম সাহেব');
      expect(text).toContain('ডায়াবেটিসের');
      expect(text).toContain('মেটফরমিন');
      expect(text).toContain('খাওয়ার সময় হয়েছে');
    });

    it('should format natural Bengali reminder text for hypertension diagnosis', () => {
      const text = service.formatBengaliReminderText({
        medicineName: 'Amlodipine 5mg',
        diagnosis: 'Essential Hypertension',
      });

      expect(text).toContain('উচ্চ রক্তচাপের');
      expect(text).toContain('Amlodipine 5mg');
      expect(text).toContain('ওষুধ সেবন করুন');
    });

    it('should format natural Bengali reminder text for respiratory/asthma diagnosis', () => {
      const text = service.formatBengaliReminderText({
        medicineName: 'Salbutamol Inhaler',
        diagnosis: 'Bronchial Asthma',
      });

      expect(text).toContain('শ্বাসকষ্টের');
      expect(text).toContain('Salbutamol Inhaler');
    });

    it('should format general Bengali reminder text when no diagnosis is provided', () => {
      const text = service.formatBengaliReminderText({
        medicineName: 'Napa Extra',
      });

      expect(text).toBe('আপনার ওষুধ Napa Extra খাওয়ার সময় হয়েছে। অনুগ্রহ করে সঠিক সময়ে ওষুধ সেবন করুন।');
    });
  });

  describe('isCriticalDosage', () => {
    it('should return true for high-risk critical medications (Insulin, Warfarin, Nitroglycerin, Amlodipine)', () => {
      expect(service.isCriticalDosage('Insulin Glargine')).toBe(true);
      expect(service.isCriticalDosage('Warfarin 5mg')).toBe(true);
      expect(service.isCriticalDosage('Nitroglycerin Sublingual')).toBe(true);
      expect(service.isCriticalDosage('Amlodipine Besylate')).toBe(true);
      expect(service.isCriticalDosage('Digoxin 0.25mg')).toBe(true);
      expect(service.isCriticalDosage('Chemotherapy Agent')).toBe(true);
    });

    it('should return false for regular/non-critical medications (Paracetamol, Antacid, Vitamin C)', () => {
      expect(service.isCriticalDosage('Napa Extra', 'Paracetamol')).toBe(false);
      expect(service.isCriticalDosage('Antacid Max')).toBe(false);
      expect(service.isCriticalDosage('Ceevit', 'Vitamin C')).toBe(false);
    });
  });

  describe('synthesizeSpeech & generateAndUploadAudioReminder', () => {
    it('should synthesize speech audio buffer and upload to S3', async () => {
      const result = await service.generateAndUploadAudioReminder(
        'rem-test-101',
        'আপনার ডায়াবেটিসের ওষুধ মেটফরমিন খাওয়ার সময় হয়েছে।',
        'bn-BD',
      );

      expect(result.audioUrl).toContain('https://mock-s3.shebamitro.health/prescriptions/audio-reminders/rem-test-101');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(s3Service.uploadBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('prescriptions/audio-reminders/rem-test-101'),
        'audio/mpeg',
      );
    });
  });

  describe('triggerIvrCall', () => {
    it('should initiate automated IVR telephone call for critical dosages', async () => {
      const result = await service.triggerIvrCall(
        '8801711223344',
        'https://mock-s3.shebamitro.health/audio.mp3',
        'আপনার ইনসুলিন নেওয়ার সময় হয়েছে।',
      );

      expect(result.success).toBe(true);
      expect(result.callSid).toBeDefined();
    });
  });

  describe('processAudioReminder (End-to-End Pipeline)', () => {
    it('should synthesize Bengali audio, dispatch WhatsApp voice note, and trigger IVR call for critical dosage (Insulin)', async () => {
      const input = {
        reminderId: 'rem-critical-1',
        patientId: 'patient-uuid-1',
        medicineName: 'Insulin Mixtard 30/70',
        genericName: 'Biphasic Isophane Insulin',
        diagnosis: 'Type 1 Diabetes Mellitus',
        patientPhone: '8801819000000',
        patientName: 'কামাল হোসেন',
        preferredLanguage: 'bn',
      };

      const result = await service.processAudioReminder(input);

      expect(result.reminderId).toBe('rem-critical-1');
      expect(result.preferredLanguage).toBe('bn');
      expect(result.bengaliSpeechText).toContain('কামাল হোসেন');
      expect(result.bengaliSpeechText).toContain('ডায়াবেটিসের');
      expect(result.bengaliSpeechText).toContain('Insulin Mixtard 30/70');
      expect(result.audioUrl).toBeDefined();
      expect(result.isCritical).toBe(true);
      expect(result.voiceNoteSent).toBe(true);
      expect(result.ivrCallTriggered).toBe(true);

      // Verify WhatsApp voice note sent
      expect(whatsAppService.sendVoiceNote).toHaveBeenCalledWith(
        '8801819000000',
        result.audioUrl,
      );
    });

    it('should synthesize Bengali audio, dispatch WhatsApp voice note, and SKIP IVR call for non-critical dosage (Napa)', async () => {
      const input = {
        reminderId: 'rem-noncritical-2',
        patientId: 'patient-uuid-2',
        medicineName: 'Napa Extra',
        genericName: 'Paracetamol',
        diagnosis: 'Fever',
        patientPhone: '8801700000000',
        patientName: 'সালমা বেগম',
        preferredLanguage: 'bn',
      };

      const result = await service.processAudioReminder(input);

      expect(result.isCritical).toBe(false);
      expect(result.voiceNoteSent).toBe(true);
      expect(result.ivrCallTriggered).toBe(false);
      expect(result.ivrCallSid).toBeUndefined();

      expect(whatsAppService.sendVoiceNote).toHaveBeenCalledWith(
        '8801700000000',
        result.audioUrl,
      );
    });
  });
});
