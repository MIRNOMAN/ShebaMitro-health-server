import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service.js';
import { SearchDoctorsQueryDto } from './dto/search-doctors-query.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get('specialties')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get all medical specialties with dynamic doctor counts per category',
  })
  @ResponseMessage('Doctor specialties fetched successfully')
  async getSpecialties() {
    return this.doctorsService.getSpecialtiesWithStats();
  }

  @Public()
  @Get('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single medical specialty details by ID or code' })
  @ResponseMessage('Doctor specialty fetched successfully')
  async getSpecialtyById(@Param('id') id: string) {
    return this.doctorsService.getSpecialtyById(id);
  }

  @Public()
  @Post('specialties')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new medical specialty' })
  @ResponseMessage('Doctor specialty created successfully')
  async createSpecialty(@Body() data: any) {
    return this.doctorsService.createSpecialty(data);
  }

  @Public()
  @Put('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update medical specialty' })
  @ResponseMessage('Doctor specialty updated successfully')
  async updateSpecialty(@Param('id') id: string, @Body() data: any) {
    return this.doctorsService.updateSpecialty(id, data);
  }

  @Public()
  @Delete('specialties/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete medical specialty' })
  @ResponseMessage('Doctor specialty deleted successfully')
  async deleteSpecialty(@Param('id') id: string) {
    return this.doctorsService.deleteSpecialty(id);
  }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Search and filter doctors with multi-faceted parameters and offset pagination',
  })
  @ResponseMessage('Doctors fetched successfully')
  async searchDoctors(@Query() queryDto: SearchDoctorsQueryDto) {
    return this.doctorsService.searchDoctors(queryDto);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get doctor details by ID with dynamic slots' })
  @ResponseMessage('Doctor details fetched successfully')
  async getDoctorById(@Param('id') id: string) {
    return this.doctorsService.getDoctorById(id);
  }
}
