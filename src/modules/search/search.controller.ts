import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('trending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dynamic trending medical search terms',
    description: 'Retrieves top trending specialties, lab tests, medicines, and symptoms.',
  })
  @ResponseMessage('Trending searches retrieved successfully')
  async getTrendingSearches(): Promise<string[]> {
    return this.searchService.getTrendingSearches();
  }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Omni healthcare search across doctors, symptoms, lab tests, and medicines',
    description: 'Performs unified search and returns structured items with category badges and deep links.',
  })
  @ResponseMessage('Search results retrieved successfully')
  async search(@Query() dto: SearchQueryDto) {
    return this.searchService.search(dto);
  }
}
