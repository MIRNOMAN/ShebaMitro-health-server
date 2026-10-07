import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { OcrEngineService } from './ocr-engine.service.js';
import { UploadReportScanDto } from './dto/upload-report-scan.dto.js';
import { QueryBiomarkersDto } from './dto/query-biomarkers.dto.js';
import { Role } from '@prisma/client';

@Injectable()
export class ReportOcrService {
  private readonly logger = new Logger(ReportOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrEngineService: OcrEngineService,
  ) {}

  /**
   * Upload external lab scan, run AWS Textract / OCR parsing, validate against medical reference ranges,
   * and store structured numerical biomarkers in DB.
   */
  async processReportScan(
    callerUserId: string,
    callerRole: string,
    dto: UploadReportScanDto,
    fileBuffer?: Buffer,
  ) {
    // 1. Resolve Patient Profile ID
    const patientId = await this.resolvePatientProfileId(dto.patientId, callerUserId, callerRole);

    // 2. Perform OCR Text Extraction
    const detectedText = await this.ocrEngineService.detectTextFromScan(fileBuffer, dto.rawText);

    if (!detectedText && !dto.rawText) {
      throw new BadRequestException('Could not detect text from provided lab scan image/document');
    }

    // 3. Extract & Validate Structured Numerical Biomarkers
    const extractedBiomarkers = this.ocrEngineService.parseBiomarkersFromText(
      detectedText || dto.rawText || '',
      dto.testType,
    );

    if (extractedBiomarkers.length === 0) {
      throw new BadRequestException(`No numerical biomarkers could be extracted for test type ${dto.testType}`);
    }

    // 4. Save to BiomarkerRecord table
    const recordedDate = dto.recordedAt ? new Date(dto.recordedAt) : new Date();

    const savedRecords = await Promise.all(
      extractedBiomarkers.map((b) =>
        this.prisma.biomarkerRecord.create({
          data: {
            patientId,
            testType: dto.testType,
            markerKey: b.markerKey,
            markerName: b.markerName,
            value: b.value,
            unit: b.unit,
            referenceRange: b.referenceRange,
            status: b.status,
            scanFileUrl: dto.scanFileUrl || null,
            recordedAt: recordedDate,
          },
        }),
      ),
    );

    this.logger.log(
      `Ingested ${savedRecords.length} structured biomarkers for patient [${patientId}] from ${dto.testType} scan.`,
    );

    return {
      success: true,
      testType: dto.testType,
      extractedCount: savedRecords.length,
      biomarkers: savedRecords,
    };
  }

  /**
   * Retrieve chronological data points formatted for frontend charting
   */
  async getBiomarkersAnalytics(targetPatientId: string, query: QueryBiomarkersDto) {
    const patientProfile = await this.prisma.patientProfile.findFirst({
      where: {
        OR: [{ id: targetPatientId }, { userId: targetPatientId }],
      },
    });

    if (!patientProfile) {
      throw new NotFoundException(`Patient profile not found for ID: ${targetPatientId}`);
    }

    const markerFilter = query.marker ? query.marker.trim().toLowerCase() : undefined;

    const records = await this.prisma.biomarkerRecord.findMany({
      where: {
        patientId: patientProfile.id,
        ...(markerFilter
          ? { markerKey: { contains: markerFilter, mode: 'insensitive' } }
          : {}),
        ...(query.testType
          ? { testType: { equals: query.testType, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { recordedAt: 'asc' },
      take: query.limit || 50,
    });

    // Format for frontend charting (Recharts / Chart.js / ApexCharts)
    const chartData = records.map((r) => ({
      id: r.id,
      timestamp: r.recordedAt.toISOString(),
      date: r.recordedAt.toISOString().split('T')[0],
      value: r.value,
      unit: r.unit,
      markerKey: r.markerKey,
      markerName: r.markerName,
      status: r.status,
      referenceRange: r.referenceRange,
    }));

    const latest = records[records.length - 1];

    return {
      patientId: patientProfile.id,
      markerKey: markerFilter || (latest ? latest.markerKey : 'all'),
      markerName: latest ? latest.markerName : (markerFilter || 'Biomarker Analytics'),
      unit: latest ? latest.unit : '',
      referenceRange: latest ? latest.referenceRange : '',
      latestStatus: latest ? latest.status : 'N/A',
      totalDataPoints: chartData.length,
      chartData,
      dataPoints: records,
    };
  }

  /**
   * Helper to resolve PatientProfile ID from profile ID or User ID
   */
  private async resolvePatientProfileId(
    providedId: string | undefined,
    callerUserId: string,
    callerRole: string,
  ): Promise<string> {
    if (providedId) {
      const byId = await this.prisma.patientProfile.findFirst({
        where: { OR: [{ id: providedId }, { userId: providedId }] },
      });
      if (byId) return byId.id;
      throw new NotFoundException(`Patient profile not found for ID: ${providedId}`);
    }

    if (callerRole === Role.PATIENT) {
      const callerProfile = await this.prisma.patientProfile.findUnique({
        where: { userId: callerUserId },
      });
      if (callerProfile) return callerProfile.id;
    }

    throw new BadRequestException('patientId is required when uploading report scans');
  }
}
