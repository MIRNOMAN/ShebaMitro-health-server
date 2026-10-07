import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CaslAbilityFactory,
  Action,
} from '../../common/casl/casl-ability.factory.js';
import { CreateFamilyMemberDto } from './dto/create-family-member.dto.js';
import { UpdateFamilyMemberDto } from './dto/update-family-member.dto.js';
import { BookFamilyAppointmentDto } from './dto/book-family-appointment.dto.js';
import { CreateFamilyReminderDto } from './dto/create-family-reminder.dto.js';
import { Role } from '@prisma/client';

@Injectable()
export class FamilyMemberService {
  private readonly logger = new Logger(FamilyMemberService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Register a new dependent family member for the primary account holder
   */
  async createFamilyMember(
    primaryUserId: string,
    callerRole: string,
    dto: CreateFamilyMemberDto,
  ) {
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.CREATE, 'FamilyMember')) {
      throw new ForbiddenException(
        'User lacks permission to create family members',
      );
    }

    const dobDate = dto.dob ? new Date(dto.dob) : null;

    const familyMember = await this.prisma.familyMember.create({
      data: {
        primaryUserId,
        fullName: dto.fullName,
        relation: dto.relation,
        dob: dobDate,
        gender: dto.gender || null,
        bloodGroup: dto.bloodGroup || null,
        allergies: dto.allergies || [],
      },
    });

    this.logger.log(
      `Created dependent family member [${familyMember.id}] (${dto.relation}) for user [${primaryUserId}]`,
    );
    return familyMember;
  }

  /**
   * List all dependent family members owned by primary user
   */
  async getFamilyMembers(primaryUserId: string, callerRole: string) {
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.READ, 'FamilyMember')) {
      throw new ForbiddenException(
        'User lacks permission to view family members',
      );
    }

    return this.prisma.familyMember.findMany({
      where: { primaryUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { appointments: true, prescriptions: true, reminders: true },
        },
      },
    });
  }

  /**
   * Get specific family member details (with CASL authorization check)
   */
  async getFamilyMemberById(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
  ) {
    const familyMember = await this.prisma.familyMember.findUnique({
      where: { id: familyMemberId },
    });

    if (!familyMember) {
      throw new NotFoundException(
        `Family member not found for ID: ${familyMemberId}`,
      );
    }

    this.validateFamilyMemberOwnership(primaryUserId, callerRole, familyMember);
    return familyMember;
  }

  /**
   * Update dependent family member details
   */
  async updateFamilyMember(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
    dto: UpdateFamilyMemberDto,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );

    const updated = await this.prisma.familyMember.update({
      where: { id: familyMember.id },
      data: {
        ...(dto.fullName ? { fullName: dto.fullName } : {}),
        ...(dto.relation ? { relation: dto.relation } : {}),
        ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.bloodGroup !== undefined ? { bloodGroup: dto.bloodGroup } : {}),
        ...(dto.allergies !== undefined ? { allergies: dto.allergies } : {}),
      },
    });

    return updated;
  }

  /**
   * Remove dependent family member
   */
  async deleteFamilyMember(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );

    await this.prisma.familyMember.delete({
      where: { id: familyMember.id },
    });

    return { success: true, message: 'Family member removed successfully' };
  }

  /**
   * Book appointment on behalf of dependent family member (CASL-authorized)
   */
  async bookFamilyAppointment(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
    dto: BookFamilyAppointmentDto,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.BOOK_APPOINTMENT, 'Appointment')) {
      throw new ForbiddenException(
        'User lacks permission to book appointments',
      );
    }

    // Resolve or auto-create primary user's PatientProfile
    let patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId: primaryUserId },
    });

    if (!patientProfile) {
      patientProfile = await this.prisma.patientProfile.create({
        data: { userId: primaryUserId },
      });
    }

    // Verify doctor existence
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: dto.doctorId },
    });

    if (!doctor) {
      throw new NotFoundException(
        `Doctor profile not found for ID: ${dto.doctorId}`,
      );
    }

    const slotStart = new Date(dto.slotStartTime);
    const slotEnd = new Date(dto.slotEndTime);

    // Check slot collision
    const existing = await this.prisma.appointment.findUnique({
      where: {
        doctorId_slotStartTime: {
          doctorId: dto.doctorId,
          slotStartTime: slotStart,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Doctor slot already booked for the selected start time',
      );
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        doctorId: dto.doctorId,
        patientId: patientProfile.id,
        familyMemberId: familyMember.id,
        slotStartTime: slotStart,
        slotEndTime: slotEnd,
        type: dto.type || 'ONLINE',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        notes: dto.notes
          ? `[Booked for Family Member: ${familyMember.fullName} (${familyMember.relation})] - ${dto.notes}`
          : `[Booked for Family Member: ${familyMember.fullName} (${familyMember.relation})]`,
      },
      include: {
        doctor: { select: { id: true, name: true, specialization: true } },
        familyMember: true,
      },
    });

    this.logger.log(
      `Booked appointment [${appointment.id}] for Family Member [${familyMember.fullName}] with Doctor [${doctor.name}]`,
    );

    return appointment;
  }

  /**
   * View prescriptions for dependent family member (CASL-authorized)
   */
  async getFamilyPrescriptions(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.VIEW_PRESCRIPTION, 'Prescription')) {
      throw new ForbiddenException(
        'User lacks permission to view prescriptions',
      );
    }

    return this.prisma.prescription.findMany({
      where: {
        OR: [
          { familyMemberId: familyMember.id },
          { appointment: { familyMemberId: familyMember.id } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            hospital: true,
          },
        },
        items: true,
        familyMember: true,
      },
    });
  }

  /**
   * Set independent medicine reminder alarms for dependent family member (CASL-authorized)
   */
  async createFamilyReminder(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
    dto: CreateFamilyReminderDto,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.MANAGE_REMINDERS, 'MedicineReminder')) {
      throw new ForbiddenException(
        'User lacks permission to manage medicine reminders',
      );
    }

    const prescriptionItem = await this.prisma.prescriptionItem.findUnique({
      where: { id: dto.prescriptionItemId },
    });

    if (!prescriptionItem) {
      throw new NotFoundException(
        `Prescription item not found for ID: ${dto.prescriptionItemId}`,
      );
    }

    let patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId: primaryUserId },
    });

    if (!patientProfile) {
      patientProfile = await this.prisma.patientProfile.create({
        data: { userId: primaryUserId },
      });
    }

    const reminder = await this.prisma.medicineReminder.create({
      data: {
        patientId: patientProfile.id,
        familyMemberId: familyMember.id,
        prescriptionItemId: dto.prescriptionItemId,
        intakeTime: new Date(dto.intakeTime),
        status: 'PENDING',
      },
      include: {
        prescriptionItem: true,
        familyMember: true,
      },
    });

    this.logger.log(
      `Set independent medicine reminder [${reminder.id}] for Family Member [${familyMember.fullName}]`,
    );
    return reminder;
  }

  /**
   * Retrieve independent medicine reminder alarms for family member
   */
  async getFamilyReminders(
    primaryUserId: string,
    callerRole: string,
    familyMemberId: string,
  ) {
    const familyMember = await this.getFamilyMemberById(
      primaryUserId,
      callerRole,
      familyMemberId,
    );
    const ability = this.caslAbilityFactory.createForUser({
      id: primaryUserId,
      role: callerRole,
    });

    if (!ability.can(Action.MANAGE_REMINDERS, 'MedicineReminder')) {
      throw new ForbiddenException(
        'User lacks permission to view medicine reminders',
      );
    }

    return this.prisma.medicineReminder.findMany({
      where: { familyMemberId: familyMember.id },
      orderBy: { intakeTime: 'asc' },
      include: {
        prescriptionItem: true,
        familyMember: true,
      },
    });
  }

  /**
   * Helper to enforce CASL-based family member ownership rules
   */
  private validateFamilyMemberOwnership(
    primaryUserId: string,
    callerRole: string,
    familyMember: any,
  ) {
    if (callerRole === Role.ADMIN) {
      return;
    }

    if (callerRole === Role.DOCTOR) {
      return;
    }

    if (familyMember.primaryUserId !== primaryUserId) {
      throw new ForbiddenException(
        'You do not have authorization to access this family member record',
      );
    }
  }
}
