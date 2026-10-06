import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalAiController } from './clinical-ai.controller.js';
import { VoiceScribeService } from './voice-scribe.service.js';

describe('ClinicalAiController', () => {
  let controller: ClinicalAiController;
  let service: any;

  const mockTranscribeResult = {
    appointmentId: 'appt-100',
    transcriptionText: 'Patient has high fever and throat pain',
    soapNotes: {
      subjective: 'Patient reports fever and throat pain for 2 days.',
      objective: 'Temp 101.2F, tonsillar redness.',
      assessment: 'Acute pharyngitis.',
      plan: 'Paracetamol and hydration.',
    },
    chiefComplaints: ['High fever', 'Throat pain'],
    suggestedMedications: [
      {
        medicineName: 'Paracetamol 500mg',
        dosageForm: 'Tablet',
        schedulePattern: '1+1+1',
        mealTiming: 'AFTER_MEAL',
        durationDays: 5,
      },
    ],
    requiresDoctorVerification: true,
    disclaimer: 'Doctor verification required.',
    processedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    service = {
      transcribeConsultation: jest.fn().mockResolvedValue(mockTranscribeResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicalAiController],
      providers: [{ provide: VoiceScribeService, useValue: service }],
    }).compile();

    controller = module.get<ClinicalAiController>(ClinicalAiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('transcribeConsultation', () => {
    it('should call transcribeConsultation on VoiceScribeService', async () => {
      const dto = { appointmentId: 'appt-100' };
      const result = await controller.transcribeConsultation(undefined, dto);

      expect(result).toEqual(mockTranscribeResult);
      expect(service.transcribeConsultation).toHaveBeenCalledWith(undefined, dto);
    });
  });
});
