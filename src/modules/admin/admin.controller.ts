import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
}
