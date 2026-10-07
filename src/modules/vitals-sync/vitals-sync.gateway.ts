import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface EmergencyAlertPayload {
  alertId: string;
  patientId: string;
  patientName?: string | null;
  doctorId?: string | null;
  doctorUserId?: string | null;
  vitalId?: string | null;
  vitalType: string;
  value: number;
  unit: string;
  threshold: string;
  severity: string;
  message: string;
  createdAt: Date | string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/vitals',
})
export class VitalsSyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VitalsSyncGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to vitals gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from vitals gateway: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    if (payload?.roomId) {
      client.join(payload.roomId);
      this.logger.log(`Client ${client.id} joined vitals room: ${payload.roomId}`);
      return { event: 'joinedRoom', data: { roomId: payload.roomId } };
    }
  }

  /**
   * Emit emergency vital alert to patient's assigned cardiologist and subscribed clients via WebSockets
   */
  emitEmergencyAlert(payload: EmergencyAlertPayload) {
    this.logger.warn(
      `🚨 [EMERGENCY ALERT] Emitting vital alert for Patient ${payload.patientId}: ${payload.message}`,
    );

    if (this.server) {
      // Broadcast globally to namespace listeners
      this.server.emit('emergency_alert', payload);
      this.server.emit('vital_alert', payload);

      // Targeted emissions to assigned doctor rooms
      if (payload.doctorId) {
        this.server.to(`doctor_${payload.doctorId}`).emit('emergency_alert', payload);
        this.server.to(`doctor_${payload.doctorId}`).emit('vital_alert', payload);
      }
      if (payload.doctorUserId) {
        this.server.to(`user_${payload.doctorUserId}`).emit('emergency_alert', payload);
        this.server.to(`user_${payload.doctorUserId}`).emit('vital_alert', payload);
      }

      // Targeted emission to patient room
      if (payload.patientId) {
        this.server.to(`patient_${payload.patientId}`).emit('emergency_alert', payload);
      }
    }
  }
}
