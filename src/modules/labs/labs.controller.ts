import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { LabsService } from './labs.service.js';
import { FilterLabTestsDto } from './dto/filter-lab-tests.dto.js';
import { CreateLabOrderDto } from './dto/create-lab-order.dto.js';
import { AssignTechnicianDto } from './dto/assign-technician.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Labs', 'Lab Diagnostic Services')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Public()
  @Get('tests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search and filter diagnostic lab tests',
    description:
      'Provides full-text search and multi-criteria filtering by category, fastingRequired, max turnaroundTime, price range, and labAccreditation.',
  })
  @ResponseMessage('Lab tests retrieved successfully')
  async searchLabTests(@Query() dto: FilterLabTestsDto) {
    return this.labsService.searchLabTests(dto);
  }

  @Post('orders')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book home sample collection for lab tests',
    description:
      'Allows patients to book home phlebotomist sample collection for selected diagnostic lab tests.',
  })
  @ResponseMessage('Home sample collection lab order booked successfully')
  async createLabOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLabOrderDto,
  ) {
    return this.labsService.createLabOrder(userId, dto);
  }

  @Put('orders/:id/assign-technician')
  @Roles(Role.LAB, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispatch phlebotomist technician with geolocation coordinates',
    description:
      'Assigns a phlebotomist technician to a lab order and records live GPS geolocation coordinates.',
  })
  @ResponseMessage('Phlebotomist technician assigned and dispatched successfully')
  async assignTechnician(
    @Param('id') orderId: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.labsService.assignTechnician(orderId, dto);
  }

  @Post('orders/:id/upload-report')
  @Roles(Role.LAB, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload encrypted lab report PDF and dispatch patient SMS',
    description:
      'Encrypts lab report PDF buffer using AES-256-GCM, uploads encrypted payload to private S3 bucket, and dispatches automated SMS alert to patient.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Lab report PDF document file',
        },
      },
    },
  })
  @ResponseMessage('Encrypted lab report uploaded and patient SMS dispatched')
  async uploadReport(
    @Param('id') orderId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.labsService.uploadReport(orderId, file);
  }
}
