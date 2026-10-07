import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { ReportOcrService } from './report-ocr.service.js';
import { UploadReportScanDto } from './dto/upload-report-scan.dto.js';
import { QueryBiomarkersDto } from './dto/query-biomarkers.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Report OCR Processing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('ocr')
export class ReportOcrController {
  constructor(private readonly reportOcrService: ReportOcrService) {}

  @Post('upload-scan')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Upload external lab report scan (CBC, Lipid, HbA1c) & run OCR extraction',
    description:
      'Extracts structured numerical biomarkers using AWS Textract / OCR, evaluates medical reference ranges (NORMAL, HIGH, LOW, CRITICAL), and saves records to BiomarkerRecord database table.',
  })
  @ResponseMessage('Lab report scan processed and biomarkers saved successfully')
  async uploadReportScan(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UploadReportScanDto,
    @UploadedFile() file?: any,
  ) {
    const fileBuffer = file?.buffer;
    return this.reportOcrService.processReportScan(userId, role, dto, fileBuffer);
  }
}

@ApiTags('Biomarker Health Analytics')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('analytics')
export class BiomarkerAnalyticsController {
  constructor(private readonly reportOcrService: ReportOcrService) {}

  @Get('biomarkers/:patientId')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get chronological biomarker data points formatted for frontend charting',
    description:
      'Exposes chronological numerical trend data points (e.g. marker=hba1c, cholesterol, hemoglobin) formatted for Recharts, Chart.js, and ApexCharts visualization.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient Profile ID or User ID' })
  @ResponseMessage('Biomarker analytics chart data retrieved successfully')
  async getBiomarkersAnalytics(
    @Param('patientId') patientId: string,
    @Query() query: QueryBiomarkersDto,
  ) {
    return this.reportOcrService.getBiomarkersAnalytics(patientId, query);
  }
}
