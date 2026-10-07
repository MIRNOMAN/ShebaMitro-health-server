import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
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
}
