import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { EhrController } from './ehr.controller.js';
import { EhrService } from './ehr.service.js';
import { EhrRecordType } from './dto/filter-ehr.dto.js';

describe('EhrController', () => {
  let controller: EhrController;
  let ehrService: any;

  const mockEhrResponse = {
    patientDemographics: { id: 'patient-123', name: 'Abdul' },
    consentVerified: true,
    appliedFilters: { recordType: 'ALL' },
    summary: {
      totalVisitsCount: 1,
      totalPrescriptionsCount: 1,
      totalLabReportsCount: 1,
    },
    records: {
      historicalVisits: [{ id: 'appt-1' }],
      prescriptions: [{ id: 'rx-1' }],
      labReports: [{ id: 'lab-1' }],
    },
  };

  beforeEach(async () => {
    ehrService = {
      getPatientEhr: jest.fn().mockResolvedValue(mockEhrResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EhrController],
      providers: [{ provide: EhrService, useValue: ehrService }],
    }).compile();

    controller = module.get<EhrController>(EhrController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPatientEhr', () => {
    it('should call ehrService.getPatientEhr with caller credentials and filters', async () => {
      const dto = { recordType: EhrRecordType.PRESCRIPTION };
      const result = await controller.getPatientEhr(
        'user-patient-123',
        Role.PATIENT,
        'patient-123',
        dto,
      );

      expect(ehrService.getPatientEhr).toHaveBeenCalledWith(
        'user-patient-123',
        Role.PATIENT,
        'patient-123',
        dto,
      );

      expect(result.consentVerified).toBe(true);
      expect(result.records.prescriptions.length).toBe(1);
    });
  });
});
