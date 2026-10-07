import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EmergencyService } from './emergency.service.js';
import { CreateSosDto } from './dto/create-sos.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Emergency SOS & Dispatch')
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post('sos')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Trigger immediate Emergency SOS with Redis Geospatial search, live tracking link SMS, and ambulance dispatch',
    description:
      'Performs Redis GEOSEARCH & GEODIST within a 10km radius to find verified ambulances and hospitals. Generates a temporary live GPS tracking link (valid 2h), sends immediate SMS alert to emergency contacts, and dispatches real-time WebSocket notifications to nearest ambulance driver apps.',
  })
  @ResponseMessage('Emergency SOS dispatched successfully')
  async triggerSos(
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
    @Body() dto?: CreateSosDto,
  ) {
    return this.emergencyService.triggerSos(userId, role, dto);
  }

  @Get('track/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retrieve temporary live GPS tracking status using tracking token',
  })
  @ApiParam({ name: 'token', description: 'Temporary live GPS tracking token' })
  @ResponseMessage('Live tracking status retrieved successfully')
  async getTrackingStatus(@Param('token') token: string) {
    return this.emergencyService.getTrackingStatus(token);
  }

  @Post('ambulance/:id/location')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Update ambulance GPS location coordinates in DB and Redis spatial index',
  })
  @ResponseMessage('Ambulance location updated successfully')
  async updateAmbulanceLocation(
    @Param('id') ambulanceId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.emergencyService.updateAmbulanceLocation(
      ambulanceId,
      dto.latitude,
      dto.longitude,
    );
  }
}
