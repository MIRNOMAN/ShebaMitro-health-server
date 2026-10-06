import { Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      throw new WsException(`Appointment with ID ${appointmentId} not found`);
    }

    const isAssignedDoctor = appointment.doctor.userId === userId;
    const isAssignedPatient = appointment.patient.userId === userId;

    if (!isAssignedDoctor && !isAssignedPatient) {
      this.logger.warn(
        `Unauthorized room access attempt by user ${userId} for appointment ${appointmentId}`,
      );
      throw new WsException(
        'Access denied. Only the assigned doctor and patient can subscribe or publish to this appointment room.',
      );
    }

    return {
      appointment,
      isAssignedDoctor,
      isAssignedPatient,
    };
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
   * Mark message as delivered / read in database
   */
  async markMessageDelivered(
    messageId: string,
    appointmentId: string,
  ) {
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
