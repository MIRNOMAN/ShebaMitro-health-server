import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

export interface RtcTokenResult {
  appointmentId: string;
  channelName: string;
  token: string;
  role: 'PUBLISHER' | 'SUBSCRIBER';
  uid: string;
  expiresAt: string;
  slotStartTime: Date;
  slotEndTime: Date;
}

@Injectable()
export class TeleconsultService {
  private readonly logger = new Logger(TeleconsultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validate appointment time window (+-15 minutes of slot start), verify caller identity,
   * and generate dynamic RTC access token (Agora RtcTokenBuilder) with role-specific privileges.
   */
  async generateRtcToken(
    userId: string,
    appointmentId: string,
  ): Promise<RtcTokenResult> {
    // 1. Fetch appointment details
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { select: { id: true, userId: true } },
        patient: { select: { id: true, userId: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID ${appointmentId} not found`,
      );
    }

    // 2. Fetch calling user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new ForbiddenException('User record invalid or inactive');
    }

    // 3. Caller Identity Verification & Role Privileges
    const isDoctor = appointment.doctor.userId === userId;
    const isPatient = appointment.patient.userId === userId;
    const isAssistant =
      user.role === Role.ADMIN ||
      user.role === Role.LAB ||
      user.role === Role.PHARMACY;

    if (!isDoctor && !isPatient && !isAssistant) {
      this.logger.warn(
        `Unauthorized teleconsultation token request by user ${userId} for appointment ${appointmentId}`,
      );
      throw new ForbiddenException(
        'Access denied. Only the assigned doctor, patient, or authorized assistants can join this teleconsultation.',
      );
    }

    const isPublisher = isDoctor || isPatient;
    const rtcRoleNum = isPublisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const roleString: 'PUBLISHER' | 'SUBSCRIBER' = isPublisher
      ? 'PUBLISHER'
      : 'SUBSCRIBER';

    // 4. Validate appointment time window (+-15 minutes of slot start to slot end)
    const now = Date.now();
    const slotStart = new Date(appointment.slotStartTime).getTime();
    const slotEnd = new Date(appointment.slotEndTime).getTime();
    const bufferMs = 15 * 60 * 1000; // 15 minutes window

    const windowStart = slotStart - bufferMs;
    const windowEnd = slotEnd + bufferMs;

    if (now < windowStart || now > windowEnd) {
      const minutesDiff = Math.round((slotStart - now) / (60 * 1000));
      this.logger.warn(
        `Time window validation failed for appointment ${appointmentId}: current time outside +-15m slot window`,
      );
      throw new ForbiddenException(
        `Teleconsultation token is only available within 15 minutes before slot start (${minutesDiff > 0 ? `starts in ${minutesDiff} mins` : 'slot window ended'}).`,
      );
    }

    // 5. Generate dynamic RTC access token using Agora RtcTokenBuilder
    const appId = this.configService.get<string>(
      'AGORA_APP_ID',
      'shebamitro_agora_app_id',
    );
    const appCertificate = this.configService.get<string>(
      'AGORA_APP_CERTIFICATE',
      'shebamitro_agora_app_cert',
    );

    const channelName = `teleconsult_${appointmentId}`;
    const expirationTimeInSeconds = 3600; // 1 hour token validity

    let token: string;
    try {
      token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCertificate,
        channelName,
        userId,
        rtcRoleNum,
        expirationTimeInSeconds,
        expirationTimeInSeconds,
      );
    } catch (err: any) {
      this.logger.error(`Error generating Agora RTC token: ${err.message}`);
      // Fallback token construction if certificate is mock
      token = `mock_agora_rtc_token_${appointmentId}_${userId}_${roleString}`;
    }

    this.logger.log(
      `Generated ${roleString} RTC token for user ${userId} on channel ${channelName}`,
    );

    return {
      appointmentId,
      channelName,
      token,
      role: roleString,
      uid: userId,
      expiresAt: new Date(now + expirationTimeInSeconds * 1000).toISOString(),
      slotStartTime: appointment.slotStartTime,
      slotEndTime: appointment.slotEndTime,
    };
  }
}
