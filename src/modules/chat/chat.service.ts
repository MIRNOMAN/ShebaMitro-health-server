import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PrismaService } from '../../database/prisma.service.js';
import { PaginationService } from '../../common/pagination/pagination.service.js';
import { CursorPaginationDto } from '../../common/pagination/dto/cursor-pagination.dto.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Ensure only the assigned doctor and patient can subscribe or publish to the room.
   */
  async validateAppointmentAccess(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { select: { id: true, userId: true } },
        patient: { select: { id: true, userId: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${appointmentId} not found`);
    }

    const isAssignedDoctor = appointment.doctor.userId === userId;
    const isAssignedPatient = appointment.patient.userId === userId;

    if (!isAssignedDoctor && !isAssignedPatient) {
      this.logger.warn(
        `Unauthorized room access attempt by user ${userId} for appointment ${appointmentId}`,
      );
      throw new ForbiddenException(
        'Access denied. Only the assigned doctor and patient can subscribe, publish, or read messages in this room.',
      );
    }

    return {
      appointment,
      isAssignedDoctor,
      isAssignedPatient,
    };
  }

  /**
   * GET /api/v1/chat/:appointmentId/messages utilizing the composite cursor pagination engine.
   */
  async getPaginatedMessages(
    userId: string,
    appointmentId: string,
    cursorDto: CursorPaginationDto,
  ) {
    // Access control check
    await this.validateAppointmentAccess(userId, appointmentId);

    return this.paginationService.paginate(this.prisma.message, {
      where: { appointmentId },
      cursorDto,
      orderByField: 'createdAt',
      sortOrder: 'desc',
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Store conversation in Message database table.
   */
  async saveMessage(
    senderId: string,
    appointmentId: string,
    content: string,
    fileUrl?: string,
  ) {
    const message = await this.prisma.message.create({
      data: {
        appointmentId,
        senderId,
        content,
        fileUrl: fileUrl || null,
        isRead: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    this.logger.log(
      `Saved message ${message.id} for appointment ${appointmentId} from sender ${senderId}`,
    );

    return message;
  }

  /**
   * Mark messages as read with PUT /api/v1/chat/:appointmentId/read-receipts
   */
  async markRoomReadReceipts(userId: string, appointmentId: string) {
    // Access control check
    await this.validateAppointmentAccess(userId, appointmentId);

    const result = await this.prisma.message.updateMany({
      where: {
        appointmentId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    this.logger.log(
      `Marked ${result.count} unread messages as read for appointment ${appointmentId} by user ${userId}`,
    );

    return {
      count: result.count,
      appointmentId,
      readByUserId: userId,
    };
  }

  /**
   * Mark single message as delivered / read in database
   */
  async markMessageDelivered(messageId: string, appointmentId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.appointmentId !== appointmentId) {
      return null;
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    return updated;
  }

  /**
   * Retrieve recent conversation history for a room
   */
  async getRoomMessages(appointmentId: string, limit: number = 50) {
    return this.prisma.message.findMany({
      where: { appointmentId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
