import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ReportOcrService } from './report-ocr.service.js';
import { OcrEngineService } from './ocr-engine.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LabReportTestType } from './dto/upload-report-scan.dto.js';

describe('ReportOcrService', () => {
  let service: ReportOcrService;
  let prisma: any;
  let ocrEngine: any;

  const mockPatientProfile = {
    id: 'patient-profile-100',
    userId: 'user-patient-100',
  };

  const mockBiomarkerRecord = {
    id: 'bm-101',
    patientId: 'patient-profile-100',
    testType: 'HBA1C',
    markerKey: 'hba1c',
    markerName: 'HbA1c',
    value: 5.6,
    unit: '%',
    referenceRange: '< 5.7%',
    status: 'NORMAL',
    recordedAt: new Date('2026-10-07T00:00:00.000Z'),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      patientProfile: {
        findFirst: jest.fn().mockResolvedValue(mockPatientProfile),
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      biomarkerRecord: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `bm-${Math.random().toString(36).substring(7)}`,
            ...data,
            createdAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bm-1',
            patientId: 'patient-profile-100',
            testType: 'HBA1C',
            markerKey: 'hba1c',
            markerName: 'HbA1c',
            value: 5.4,
            unit: '%',
            referenceRange: '< 5.7%',
            status: 'NORMAL',
            recordedAt: new Date('2026-01-10T00:00:00.000Z'),
          },
          {
            id: 'bm-2',
            patientId: 'patient-profile-100',
            testType: 'HBA1C',
            markerKey: 'hba1c',
            markerName: 'HbA1c',
            value: 6.8,
            unit: '%',
            referenceRange: '< 5.7%',
            status: 'CRITICAL',
            recordedAt: new Date('2026-10-07T00:00:00.000Z'),
          },
        ]),
      },
    };

    ocrEngine = {
      detectTextFromScan: jest
        .fn()
        .mockImplementation((buf, raw) =>
          Promise.resolve(raw || 'HbA1c: 6.8%'),
        ),
      parseBiomarkersFromText: jest.fn().mockReturnValue([
        {
          markerKey: 'hba1c',
          markerName: 'HbA1c',
          value: 6.8,
          unit: '%',
          referenceRange: '< 5.7%',
          status: 'CRITICAL',
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportOcrService,
        { provide: PrismaService, useValue: prisma },
        { provide: OcrEngineService, useValue: ocrEngine },
      ],
    }).compile();

    service = module.get<ReportOcrService>(ReportOcrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processReportScan', () => {
    it('should run OCR text detection, extract numerical biomarkers, validate reference ranges, and save to DB', async () => {
      const dto = {
        patientId: 'patient-profile-100',
        testType: LabReportTestType.HBA1C,
        rawText: 'HbA1c: 6.8%',
      };

      const result = await service.processReportScan(
        'user-patient-100',
        Role.PATIENT,
        dto,
      );

      expect(result.success).toBe(true);
      expect(result.extractedCount).toBe(1);
      expect(result.biomarkers[0].status).toBe('CRITICAL');
      expect(prisma.biomarkerRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient-profile-100',
            markerKey: 'hba1c',
            value: 6.8,
            status: 'CRITICAL',
          }),
        }),
      );
    });
  });

  describe('getBiomarkersAnalytics', () => {
    it('should return chronological data points formatted for frontend charting', async () => {
      const result = await service.getBiomarkersAnalytics(
        'patient-profile-100',
        { marker: 'hba1c' },
      );

      expect(result.patientId).toBe('patient-profile-100');
      expect(result.totalDataPoints).toBe(2);
      expect(result.chartData[0].value).toBe(5.4);
      expect(result.chartData[1].value).toBe(6.8);
      expect(result.chartData[1].status).toBe('CRITICAL');
    });
  });
});
