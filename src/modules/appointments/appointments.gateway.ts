import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/appointments',
})
export class AppointmentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AppointmentsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to appointments gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from appointments gateway: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    if (payload?.roomId) {
      client.join(payload.roomId);
      this.logger.log(`Client ${client.id} joined room: ${payload.roomId}`);
      return { event: 'joinedRoom', data: { roomId: payload.roomId } };
    }
  }

  /**
   * Emit WebSocket notification to client/rooms when appointment status updates.
   */
  emitAppointmentNotification(event: string, payload: any) {
    this.logger.log(
      `Emitting WebSocket notification [${event}] for appointment ${payload.appointmentId}`,
    );

    if (this.server) {
      // Broadcast globally to namespace listeners
      this.server.emit('appointmentStatusChanged', { event, payload });
      this.server.emit(event, payload);

      // Emit to specific target rooms if present
      if (payload.appointmentId) {
        this.server
          .to(`appointment_${payload.appointmentId}`)
          .emit('appointmentStatusChanged', { event, payload });
      }
      if (payload.patientId) {
        this.server
          .to(`user_${payload.patientId}`)
          .emit('appointmentStatusChanged', { event, payload });
      }
      if (payload.doctorId) {
        this.server
          .to(`doctor_${payload.doctorId}`)
          .emit('appointmentStatusChanged', { event, payload });
      }
    }
  }
}
