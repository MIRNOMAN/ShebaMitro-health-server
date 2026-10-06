import { Test, TestingModule } from '@nestjs/testing';
import { MealTiming } from '@prisma/client';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;
  let service: any;

  const mockPrescription = {
    id: 'rx-999',
    appointmentId: 'appt-123',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    diagnosis: 'Acute Viral Bronchitis',
    chiefComplaints: 'High fever, Dry cough',
    vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
    advice: 'Rest and drink warm water',
    followUpDate: new Date('2026-10-15T10:00:00.000Z'),
    items: [
      {
        id: 'rx-item-1',
        medicineName: 'Napa Extra',
        genericName: 'Paracetamol + Caffeine',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+1',
        mealTiming: MealTiming.AFTER_MEAL,
        durationDays: 7,
      },
    ],
  };

  beforeEach(async () => {
    service = {
      createPrescription: jest.fn().mockResolvedValue(mockPrescription),
      getPrescriptionById: jest.fn().mockResolvedValue(mockPrescription),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [{ provide: PrescriptionsService, useValue: service }],
    }).compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/v1/prescriptions', () => {
    it('should create and finalize prescription for doctor caller', async () => {
      const dto = {
        appointmentId: 'appt-123',
        chiefComplaints: ['High fever', 'Dry cough'],
        clinicalDiagnosis: ['Acute Viral Bronchitis'],
        vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
        advice: 'Rest and drink warm water',
        followUpDate: '2026-10-15T10:00:00.000Z',
        items: [
          {
            medicineName: 'Napa Extra',
            genericName: 'Paracetamol + Caffeine',
            dosageForm: 'Tablet',
            frequency: '1+0+1',
            mealTiming: MealTiming.AFTER_MEAL,
            durationDays: 7,
          },
        ],
      };

      const result = await controller.createPrescription('user-doc-1', dto);

      expect(service.createPrescription).toHaveBeenCalledWith('user-doc-1', dto);
      expect(result.id).toBe('rx-999');
    });
  });
});
