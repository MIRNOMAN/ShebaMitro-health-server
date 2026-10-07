import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { FamilyMemberService } from './family-member.service.js';
import { CreateFamilyMemberDto } from './dto/create-family-member.dto.js';
import { UpdateFamilyMemberDto } from './dto/update-family-member.dto.js';
import { BookFamilyAppointmentDto } from './dto/book-family-appointment.dto.js';
import { CreateFamilyReminderDto } from './dto/create-family-reminder.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

@ApiTags('Dependent Family Members')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('family-members')
export class FamilyMemberController {
  constructor(private readonly familyMemberService: FamilyMemberService) {}

  @Post()
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register dependent family member',
    description:
      'Adds a dependent family member (PARENT, SPOUSE, CHILD) under the primary user account without requiring separate phone logins.',
  })
  @ResponseMessage('Dependent family member registered successfully')
  async createFamilyMember(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateFamilyMemberDto,
  ) {
    return this.familyMemberService.createFamilyMember(userId, role, dto);
  }

  @Get()
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all dependent family members for primary account holder',
  })
  @ResponseMessage('Family members retrieved successfully')
  async getFamilyMembers(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.familyMemberService.getFamilyMembers(userId, role);
  }

  @Get(':id')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get dependent family member details by ID' })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Family member details retrieved successfully')
  async getFamilyMemberById(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
  ) {
    return this.familyMemberService.getFamilyMemberById(
      userId,
      role,
      familyMemberId,
    );
  }

  @Put(':id')
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update dependent family member details' })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Family member updated successfully')
  async updateFamilyMember(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
    @Body() dto: UpdateFamilyMemberDto,
  ) {
    return this.familyMemberService.updateFamilyMember(
      userId,
      role,
      familyMemberId,
      dto,
    );
  }

  @Delete(':id')
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove dependent family member' })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Family member removed successfully')
  async deleteFamilyMember(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
  ) {
    return this.familyMemberService.deleteFamilyMember(
      userId,
      role,
      familyMemberId,
    );
  }

  @Post(':id/appointments')
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Book appointment on behalf of dependent family member (CASL Authorized)',
    description:
      'Enables primary account holder to book a doctor appointment for a dependent family member.',
  })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Appointment booked for family member successfully')
  async bookFamilyAppointment(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
    @Body() dto: BookFamilyAppointmentDto,
  ) {
    return this.familyMemberService.bookFamilyAppointment(
      userId,
      role,
      familyMemberId,
      dto,
    );
  }

  @Get(':id/prescriptions')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'View prescriptions for dependent family member (CASL Authorized)',
  })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Family member prescriptions retrieved successfully')
  async getFamilyPrescriptions(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
  ) {
    return this.familyMemberService.getFamilyPrescriptions(
      userId,
      role,
      familyMemberId,
    );
  }

  @Post(':id/reminders')
  @Roles(Role.PATIENT, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create independent medicine reminder alarm for dependent family member',
  })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage(
    'Independent medicine reminder created for family member successfully',
  )
  async createFamilyReminder(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
    @Body() dto: CreateFamilyReminderDto,
  ) {
    return this.familyMemberService.createFamilyReminder(
      userId,
      role,
      familyMemberId,
      dto,
    );
  }

  @Get(':id/reminders')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get independent medicine reminders for dependent family member',
  })
  @ApiParam({ name: 'id', description: 'Family Member ID' })
  @ResponseMessage('Independent medicine reminders retrieved successfully')
  async getFamilyReminders(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') familyMemberId: string,
  ) {
    return this.familyMemberService.getFamilyReminders(
      userId,
      role,
      familyMemberId,
    );
  }
}
