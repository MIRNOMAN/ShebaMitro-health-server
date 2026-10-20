import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service.js';
import {
  FilterVerificationsDto,
  VerifyProviderDto,
  ExecutePayoutsDto,
} from './dto/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor.js';

@ApiTags('Admin Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('verifications')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated list of unverified healthcare providers',
    description:
      'Fetches unverified doctors with BMDC license docs, registration numbers, credentials, and contact info.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ResponseMessage('Unverified provider list fetched successfully')
  async getVerifications(@Query() dto: FilterVerificationsDto) {
    return this.adminService.getVerifications(dto);
  }

  @Put('verify-provider/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve or reject a healthcare provider profile',
    description:
      'Updates provider approval status and logs an explicit audit trail entry.',
  })
  @ResponseMessage('Provider verification status updated successfully')
  async verifyProvider(
    @Param('id') providerId: string,
    @Body() dto: VerifyProviderDto,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.verifyProvider(providerId, dto, adminUserId);
  }

  @Get('settlements')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate payable balances for doctors and diagnostic labs',
    description:
      'Calculates gross transaction volume, platform commission, net earnings, and payable wallet balances.',
  })
  @ResponseMessage('Provider settlements calculated successfully')
  async getSettlements() {
    return this.adminService.getSettlements();
  }

  @Post('payouts/execute')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch bank / Mobile Financial Service (MFS) payout disbursement',
    description:
      'Executes batch payouts to doctors and labs via bank transfer or MFS (bKash, Nagad) and updates wallet balances.',
  })
  @ResponseMessage('Batch payout execution completed successfully')
  async executePayouts(
    @Body() dto: ExecutePayoutsDto,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.executePayouts(dto, adminUserId);
  }

  // ==========================================
  // MASTER DATA: MEDICAL SPECIALTIES CRUD
  // ==========================================
  @Public()
  @Get('specialties')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all medical specialties for admin management' })
  @ResponseMessage('Medical specialties fetched successfully')
  async getSpecialties(@Query() query: any) {
    return this.adminService.getSpecialties(query);
  }

  @Public()
  @Get('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single medical specialty details' })
  @ResponseMessage('Medical specialty fetched successfully')
  async getSpecialtyById(@Param('id') id: string) {
    return this.adminService.getSpecialtyById(id);
  }

  @Public()
  @Post('specialties')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new medical specialty' })
  @ResponseMessage('Medical specialty created successfully')
  async createSpecialty(@Body() data: any) {
    return this.adminService.createSpecialty(data);
  }

  @Public()
  @Put('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update medical specialty' })
  @ResponseMessage('Medical specialty updated successfully')
  async updateSpecialty(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateSpecialty(id, data);
  }

  @Public()
  @Delete('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete medical specialty' })
  @ResponseMessage('Medical specialty deleted successfully')
  async deleteSpecialty(@Param('id') id: string) {
    return this.adminService.deleteSpecialty(id);
  }

  // ==========================================
  // MASTER DATA: ICD-10 DIAGNOSES CRUD
  // ==========================================
  @Public()
  @Get('icd10')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paginated ICD-10 master diagnosis catalog' })
  @ResponseMessage('ICD-10 diagnoses fetched successfully')
  async getIcd10(@Query() query: any) {
    return this.adminService.getIcd10(query);
  }

  @Public()
  @Get('icd10/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single ICD-10 diagnosis record' })
  @ResponseMessage('ICD-10 diagnosis fetched successfully')
  async getIcd10ById(@Param('id') id: string) {
    return this.adminService.getIcd10ById(id);
  }

  @Public()
  @Post('icd10')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new ICD-10 diagnosis record' })
  @ResponseMessage('ICD-10 diagnosis created successfully')
  async createIcd10(@Body() data: any) {
    return this.adminService.createIcd10(data);
  }

  @Public()
  @Put('icd10/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ICD-10 diagnosis record' })
  @ResponseMessage('ICD-10 diagnosis updated successfully')
  async updateIcd10(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateIcd10(id, data);
  }

  @Public()
  @Delete('icd10/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete ICD-10 diagnosis record' })
  @ResponseMessage('ICD-10 diagnosis deleted successfully')
  async deleteIcd10(@Param('id') id: string) {
    return this.adminService.deleteIcd10(id);
  }

  // ==========================================
  // MASTER DATA: APPROVED DRUGS / MEDICINES CRUD
  // ==========================================
  @Public()
  @Get('medicines')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paginated platform medicines and drugs catalog' })
  @ResponseMessage('Medicines catalog fetched successfully')
  async getMedicines(@Query() query: any) {
    return this.adminService.getMedicines(query);
  }

  @Public()
  @Get('medicines/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single medicine details' })
  @ResponseMessage('Medicine fetched successfully')
  async getMedicineById(@Param('id') id: string) {
    return this.adminService.getMedicineById(id);
  }

  @Public()
  @Post('medicines')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new medicine master record' })
  @ResponseMessage('Medicine created successfully')
  async createMedicine(@Body() data: any) {
    return this.adminService.createMedicine(data);
  }

  @Public()
  @Put('medicines/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update medicine master record' })
  @ResponseMessage('Medicine updated successfully')
  async updateMedicine(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateMedicine(id, data);
  }

  @Public()
  @Delete('medicines/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete medicine master record' })
  @ResponseMessage('Medicine deleted successfully')
  async deleteMedicine(@Param('id') id: string) {
    return this.adminService.deleteMedicine(id);
  }
}
