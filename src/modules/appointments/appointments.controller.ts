import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AppointmentsService } from './appointments.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book a doctor appointment slot (Patient only)',
    description:
      'Acquires a distributed lock using Redlock on key lock:doctor:{doctorId}:slot:{slotTime}. In a Prisma transaction, verifies slot availability, sets status to PENDING with a 10-minute payment grace period, and records an expiration job in BullMQ.',
  })
  @ResponseMessage('Appointment created successfully. Please complete payment within 10 minutes.')
  async createAppointment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.createAppointment(userId, dto);
  }

  @Post(':id/confirm-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm payment for an appointment',
    description:
      'Transitions appointment status from PENDING to CONFIRMED, cancels BullMQ expiration job, and emits WebSocket notification.',
  })
  @ResponseMessage('Payment confirmed successfully. Appointment is now CONFIRMED.')
  async confirmPayment(
    @Param('id') appointmentId: string,
    @CurrentUser('id') userId: string,
    @Body() _dto: ConfirmPaymentDto,
  ) {
    return this.appointmentsService.confirmPayment(appointmentId, userId);
  }

  @Get()
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get patient appointments list' })
  @ResponseMessage('Appointments fetched successfully')
  async getMyAppointments(@CurrentUser('id') userId: string) {
    return this.appointmentsService.getPatientAppointments(userId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get appointment details by ID' })
  @ResponseMessage('Appointment fetched successfully')
  async getAppointmentById(@Param('id') appointmentId: string) {
    return this.appointmentsService.getAppointmentById(appointmentId);
  }
}
