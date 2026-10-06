import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VoiceScribeService } from './voice-scribe.service.js';

describe('VoiceScribeService', () => {
  let service: VoiceScribeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceScribeService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) },
        },
      ],
    }).compile();

    service = module.get<VoiceScribeService>(VoiceScribeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transcribeConsultation', () => {
    it('should parse raw transcript into structured SOAP notes, chief complaints, and suggested medications', async () => {
      const dto = {
        appointmentId: 'appt-12345',
        existingTranscript:
          'Patient complains of severe headache and fever of 101F for 3 days. Exam shows BP 120/80 and congested throat. Prescribed Paracetamol 500mg.',
      };

      const result = await service.transcribeConsultation(undefined, dto);

      expect(result.appointmentId).toBe('appt-12345');
      expect(result.transcriptionText).toContain('headache');
      expect(result.soapNotes.subjective).toBeDefined();
      expect(result.soapNotes.objective).toBeDefined();
      expect(result.soapNotes.assessment).toBeDefined();
      expect(result.soapNotes.plan).toBeDefined();
      expect(result.chiefComplaints.length).toBeGreaterThan(0);
      expect(result.suggestedMedications.length).toBeGreaterThan(0);
      expect(result.requiresDoctorVerification).toBe(true);
      expect(result.disclaimer).toContain('Verification Required');
    });

    it('should transcribe uploaded audio file buffer when file is provided', async () => {
      const mockFile = {
        fieldname: 'audio',
        originalname: 'consultation_chunk_1.wav',
        encoding: '7bit',
        mimetype: 'audio/wav',
        buffer: Buffer.from('mock-audio-data'),
        size: 1024,
      } as Express.Multer.File;

      const dto = { appointmentId: 'appt-999' };
      const result = await service.transcribeConsultation(mockFile, dto);

      expect(result.appointmentId).toBe('appt-999');
      expect(result.transcriptionText).toBeDefined();
      expect(result.soapNotes.assessment).toBeDefined();
      expect(result.suggestedMedications[0].medicineName).toBeDefined();
    });
  });
});
