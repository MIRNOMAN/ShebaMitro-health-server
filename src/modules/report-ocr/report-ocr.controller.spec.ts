import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ReportOcrController, BiomarkerAnalyticsController } from './report-ocr.controller.js';
import { ReportOcrService } from './report-ocr.service.js';
import { LabReportTestType } from './dto/upload-report-scan.dto.js';

describe('ReportOcrController & BiomarkerAnalyticsController', () => {
  let ocrController: ReportOcrController;
  let analyticsController: BiomarkerAnalyticsController;
  let service: any;

  const mockScanResponse = {
    success: true,
    testType: 'HBA1C',
    extractedCount: 1,
    biomarkers: [{ id: 'bm-1', markerKey: 'hba1c', value: 5.6, status: 'NORMAL' }],
  };

  const mockAnalyticsResponse = {
    patientId: 'patient-100',
    markerKey: 'hba1c',
    totalDataPoints: 2,
    chartData: [
      { timestamp: '2026-01-10T00:00:00.000Z', value: 5.4, status: 'NORMAL' },
      { timestamp: '2026-10-07T00:00:00.000Z', value: 5.6, status: 'NORMAL' },
    ],
  };

  beforeEach(async () => {
    service = {
      processReportScan: jest.fn().mockResolvedValue(mockScanResponse),
      getBiomarkersAnalytics: jest.fn().mockResolvedValue(mockAnalyticsResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportOcrController, BiomarkerAnalyticsController],
      providers: [{ provide: ReportOcrService, useValue: service }],
    }).compile();

    ocrController = module.get<ReportOcrController>(ReportOcrController);
    analyticsController = module.get<BiomarkerAnalyticsController>(BiomarkerAnalyticsController);
  });

  it('should be defined', () => {
    expect(ocrController).toBeDefined();
    expect(analyticsController).toBeDefined();
  });

  describe('uploadReportScan', () => {
    it('should delegate report scan processing to service', async () => {
      const dto = { testType: LabReportTestType.HBA1C, rawText: 'HbA1c: 5.6%' };
      const result = await ocrController.uploadReportScan('user-100', Role.PATIENT, dto, undefined);

      expect(service.processReportScan).toHaveBeenCalledWith('user-100', Role.PATIENT, dto, undefined);
      expect(result).toBe(mockScanResponse);
    });
  });

  describe('getBiomarkersAnalytics', () => {
    it('should delegate biomarker analytics querying to service', async () => {
      const result = await analyticsController.getBiomarkersAnalytics('patient-100', { marker: 'hba1c' });

      expect(service.getBiomarkersAnalytics).toHaveBeenCalledWith('patient-100', { marker: 'hba1c' });
      expect(result).toBe(mockAnalyticsResponse);
    });
  });
});
