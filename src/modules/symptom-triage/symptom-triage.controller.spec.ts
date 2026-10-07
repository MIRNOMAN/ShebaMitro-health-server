import { Test, TestingModule } from '@nestjs/testing';
import { SymptomTriageController } from './symptom-triage.controller.js';
import {
  SymptomTriageService,
  MANDATORY_MEDICAL_DISCLAIMER,
} from './symptom-triage.service.js';

describe('SymptomTriageController', () => {
  let controller: SymptomTriageController;
  let service: any;

  const mockTriageResponse = {
    urgency: 'EMERGENCY',
    urgencyLabel: 'Emergency - Immediate Medical Attention Required',
    clinicalAnalysis: 'Acute chest pain evaluation',
    matchingSpecialties: ['Cardiology', 'General Medicine'],
    recommendedAction: 'Go to nearest Emergency Room immediately',
    redFlags: ['Chest pressure'],
    matchingDoctorsCount: 1,
    topMatchingDoctors: [
      {
        id: 'doc-1',
        name: 'Dr. Shahin Rahman',
        specialization: 'Cardiology',
        rating: 4.9,
      },
    ],
    disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
    evaluatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    service = {
      triageSymptoms: jest.fn().mockResolvedValue(mockTriageResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SymptomTriageController],
      providers: [{ provide: SymptomTriageService, useValue: service }],
    }).compile();

    controller = module.get<SymptomTriageController>(SymptomTriageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triageSymptoms', () => {
    it('should call triageSymptoms on service and return analysis result', async () => {
      const dto = {
        symptoms: 'Chest pain and shortness of breath',
        duration: '30 mins',
        severity: 'SEVERE',
      };

      const result = await controller.triageSymptoms(dto);

      expect(result).toEqual(mockTriageResponse);
      expect(service.triageSymptoms).toHaveBeenCalledWith(dto);
    });
  });
});
