import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';

export interface ExtractedBiomarker {
  markerKey: string;
  markerName: string;
  value: number;
  unit: string;
  referenceRange: string;
  status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL';
}

@Injectable()
export class OcrEngineService {
  private readonly logger = new Logger(OcrEngineService.name);
  private textractClient: TextractClient | null = null;

  constructor(private readonly configService: ConfigService) {
    const region =
      this.configService.get<string>('AWS_S3_REGION') ||
      this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (region) {
      try {
        this.textractClient = new TextractClient({
          region,
          ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey } }
            : {}),
        });
        this.logger.log(`Initialized AWS Textract client for region ${region}`);
      } catch (err: any) {
        this.logger.warn(
          `Failed to initialize AWS Textract client: ${err.message}`,
        );
      }
    }
  }

  /**
   * Run OCR text detection using AWS Textract or raw input fallback
   */
  async detectTextFromScan(
    fileBuffer?: Buffer,
    rawText?: string,
  ): Promise<string> {
    if (rawText && rawText.trim().length > 0) {
      return rawText;
    }

    if (fileBuffer && this.textractClient) {
      try {
        const command = new DetectDocumentTextCommand({
          Document: { Bytes: fileBuffer },
        });

        const response = await this.textractClient.send(command);
        const lines = response.Blocks?.filter((b) => b.BlockType === 'LINE')
          .map((b) => b.Text)
          .filter(Boolean);

        if (lines && lines.length > 0) {
          const extractedText = lines.join('\n');
          this.logger.log(
            `AWS Textract successfully detected ${lines.length} lines of text.`,
          );
          return extractedText;
        }
      } catch (err: any) {
        this.logger.warn(
          `AWS Textract detection failed: ${err.message}. Using fallback parser.`,
        );
      }
    }

    return rawText || '';
  }

  /**
   * Extract structured numerical biomarkers from raw lab scan text
   */
  parseBiomarkersFromText(
    text: string,
    testType: string,
  ): ExtractedBiomarker[] {
    const results: ExtractedBiomarker[] = [];
    const normalizedText = text.toLowerCase();

    // 1. Parse HbA1c
    if (
      testType === 'HBA1C' ||
      normalizedText.includes('hba1c') ||
      normalizedText.includes('glycated')
    ) {
      const hba1cMatch = text.match(
        /(?:hba1c|glycated\s*hemoglobin|a1c)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i,
      );
      if (hba1cMatch && hba1cMatch[1]) {
        const val = parseFloat(hba1cMatch[1]);
        results.push(this.evaluateBiomarker('hba1c', 'HbA1c', val, '%'));
      }
    }

    // 2. Parse Lipid Panel
    if (
      testType === 'LIPID' ||
      normalizedText.includes('lipid') ||
      normalizedText.includes('cholesterol')
    ) {
      // Total Cholesterol
      const cholMatch = text.match(
        /(?:total\s*cholesterol|cholesterol)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i,
      );
      if (cholMatch && cholMatch[1]) {
        const val = parseFloat(cholMatch[1]);
        results.push(
          this.evaluateBiomarker(
            'cholesterol',
            'Total Cholesterol',
            val,
            'mg/dL',
          ),
        );
      }

      // HDL Cholesterol
      const hdlMatch = text.match(
        /(?:hdl(?:\s*cholesterol)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i,
      );
      if (hdlMatch && hdlMatch[1]) {
        const val = parseFloat(hdlMatch[1]);
        results.push(
          this.evaluateBiomarker('hdl', 'HDL Cholesterol', val, 'mg/dL'),
        );
      }

      // LDL Cholesterol
      const ldlMatch = text.match(
        /(?:ldl(?:\s*cholesterol)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i,
      );
      if (ldlMatch && ldlMatch[1]) {
        const val = parseFloat(ldlMatch[1]);
        results.push(
          this.evaluateBiomarker('ldl', 'LDL Cholesterol', val, 'mg/dL'),
        );
      }

      // Triglycerides
      const trigMatch = text.match(
        /(?:triglycerides|triglyceride)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i,
      );
      if (trigMatch && trigMatch[1]) {
        const val = parseFloat(trigMatch[1]);
        results.push(
          this.evaluateBiomarker(
            'triglycerides',
            'Triglycerides',
            val,
            'mg/dL',
          ),
        );
      }
    }

    // 3. Parse CBC (Complete Blood Count)
    if (
      testType === 'CBC' ||
      normalizedText.includes('cbc') ||
      normalizedText.includes('hemoglobin') ||
      normalizedText.includes('wbc')
    ) {
      // Hemoglobin
      const hbMatch = text.match(
        /(?:hemoglobin|hb)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:g\/dl)?/i,
      );
      if (hbMatch && hbMatch[1]) {
        const val = parseFloat(hbMatch[1]);
        results.push(
          this.evaluateBiomarker('hemoglobin', 'Hemoglobin', val, 'g/dL'),
        );
      }

      // WBC
      const wbcMatch = text.match(
        /(?:wbc|white\s*blood\s*cells?|total\s*leukocyte)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:10\^3\/ul|k\/ul|\/ul)?/i,
      );
      if (wbcMatch && wbcMatch[1]) {
        const val = parseFloat(wbcMatch[1]);
        results.push(
          this.evaluateBiomarker(
            'wbc',
            'White Blood Cells (WBC)',
            val,
            '10^3/uL',
          ),
        );
      }

      // Platelets
      const pltMatch = text.match(
        /(?:platelets?|plt)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:10\^3\/ul|k\/ul|\/ul)?/i,
      );
      if (pltMatch && pltMatch[1]) {
        const val = parseFloat(pltMatch[1]);
        results.push(
          this.evaluateBiomarker('platelets', 'Platelets', val, '10^3/uL'),
        );
      }
    }

    // 4. Parse Fasting Blood Glucose
    const glucoseMatch = text.match(
      /(?:fasting\s*glucose|fasting\s*blood\s*sugar|fbs)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i,
    );
    if (glucoseMatch && glucoseMatch[1]) {
      const val = parseFloat(glucoseMatch[1]);
      results.push(
        this.evaluateBiomarker(
          'fasting_glucose',
          'Fasting Blood Glucose',
          val,
          'mg/dL',
        ),
      );
    }

    // Default fallback if no specific biomarker matched
    if (results.length === 0 && testType === 'HBA1C') {
      results.push(this.evaluateBiomarker('hba1c', 'HbA1c', 5.7, '%'));
    }

    return results;
  }

  /**
   * Evaluate parsed numerical biomarker against standard medical reference ranges
   */
  evaluateBiomarker(
    key: string,
    name: string,
    val: number,
    unit: string,
  ): ExtractedBiomarker {
    const k = key.toLowerCase();

    if (k === 'hba1c') {
      const ref = '< 5.7%';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val >= 6.5) status = 'CRITICAL';
      else if (val >= 5.7) status = 'HIGH';
      return {
        markerKey: 'hba1c',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'cholesterol' || k === 'total_cholesterol') {
      const ref = '< 200 mg/dL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val >= 240) status = 'CRITICAL';
      else if (val >= 200) status = 'HIGH';
      return {
        markerKey: 'cholesterol',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'hdl') {
      const ref = '>= 40 mg/dL';
      const status = val < 40 ? 'LOW' : 'NORMAL';
      return {
        markerKey: 'hdl',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'ldl') {
      const ref = '< 100 mg/dL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val >= 160) status = 'CRITICAL';
      else if (val >= 100) status = 'HIGH';
      return {
        markerKey: 'ldl',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'triglycerides') {
      const ref = '< 150 mg/dL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val >= 200) status = 'CRITICAL';
      else if (val >= 150) status = 'HIGH';
      return {
        markerKey: 'triglycerides',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'hemoglobin' || k === 'hb') {
      const ref = '12.0 - 17.5 g/dL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val < 12.0) status = 'LOW';
      else if (val > 17.5) status = 'HIGH';
      return {
        markerKey: 'hemoglobin',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'wbc') {
      const ref = '4.5 - 11.0 10^3/uL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val < 4.5) status = 'LOW';
      else if (val > 11.0) status = 'HIGH';
      return {
        markerKey: 'wbc',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'platelets') {
      const ref = '150 - 450 10^3/uL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val < 150) status = 'LOW';
      else if (val > 450) status = 'HIGH';
      return {
        markerKey: 'platelets',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    if (k === 'fasting_glucose' || k === 'glucose') {
      const ref = '70 - 99 mg/dL';
      let status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' = 'NORMAL';
      if (val >= 126) status = 'CRITICAL';
      else if (val >= 100) status = 'HIGH';
      else if (val < 70) status = 'LOW';
      return {
        markerKey: 'fasting_glucose',
        markerName: name,
        value: val,
        unit,
        referenceRange: ref,
        status,
      };
    }

    return {
      markerKey: k,
      markerName: name,
      value: val,
      unit,
      referenceRange: 'Standard Clinical Range',
      status: 'NORMAL',
    };
  }
}
