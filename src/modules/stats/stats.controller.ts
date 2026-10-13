import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatsService } from './stats.service.js';
import { UpdateStatsDto } from './dto/update-stats.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Platform Stats & Live Activity')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * 1. Get All Home Stats & Live Activity
   * GET /api/v1/stats
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get platform stats counters and live activities for homepage',
  })
  @ResponseMessage('Platform stats and live activity retrieved successfully')
  async getHomeStats() {
    return this.statsService.getHomeStats();
  }

  /**
   * 2. Get Just Counters
   * GET /api/v1/stats/counters
   */
  @Public()
  @Get('counters')
  @ApiOperation({ summary: 'Get stats counters cards data' })
  @ResponseMessage('Stats counters retrieved successfully')
  async getCounters() {
    return this.statsService.getCounters();
  }

  /**
   * 3. Get Real-Time Live Activity Stream
   * GET /api/v1/stats/live-activity
   */
  @Public()
  @Get('live-activity')
  @ApiOperation({ summary: 'Get live activity stream for real-time ticker' })
  @ResponseMessage('Live activity stream retrieved successfully')
  async getLiveActivities() {
    return this.statsService.getLiveActivities();
  }

  /**
   * 4. Update / Customize Stats (Admin or Demo Override)
   * PATCH /api/v1/stats
   */
  @Public()
  @Patch()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Update stats counters or inject new live activity' })
  @ResponseMessage('Platform stats updated successfully')
  async updateStats(@Body() dto: UpdateStatsDto) {
    return this.statsService.updateStats(dto);
  }
}
