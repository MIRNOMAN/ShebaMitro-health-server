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

export interface EmergencyDispatchPayload {
  sosId: string;
  trackingToken: string;
  patientId?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  nearestHospital?: {
    id: string;
    name: string;
    address: string;
    distanceKm: number;
  } | null;
  ambulance?: { id: string; driverName: string; vehicleNumber: string } | null;
  createdAt: Date | string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/emergency',
})
export class EmergencyGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EmergencyGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to emergency gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from emergency gateway: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    if (payload?.roomId) {
      client.join(payload.roomId);
      this.logger.log(
        `Client ${client.id} joined emergency room: ${payload.roomId}`,
      );
      return { event: 'joinedRoom', data: { roomId: payload.roomId } };
    }
  }

  /**
   * Dispatch emergency alert to nearest ambulance driver app & emergency dispatch network
   */
  emitAmbulanceDispatch(payload: EmergencyDispatchPayload) {
    this.logger.warn(
      `🚑 [AMBULANCE DISPATCH] Dispatching SOS ${payload.sosId} to driver app (Ambulance ID: ${payload.ambulance?.id || 'GLOBAL_DISPATCH'})`,
    );

    if (this.server) {
      // 1. Broadcast globally to emergency dashboard listeners
      this.server.emit('sos_alert', payload);
      this.server.emit('ambulance_dispatch', payload);

      // 2. Target specific ambulance driver room
      if (payload.ambulance?.id) {
        this.server
          .to(`driver_${payload.ambulance.id}`)
          .emit('ambulance_dispatch', payload);
        this.server
          .to(`driver_${payload.ambulance.id}`)
          .emit('sos_alert', payload);
      }

      // 3. Target specific tracking room
      if (payload.trackingToken) {
        this.server
          .to(`track_${payload.trackingToken}`)
          .emit('ambulance_dispatch', payload);
      }
    }
  }

  /**
   * Broadcast live GPS location updates for active tracking sessions
   */
  emitLocationUpdate(
    trackingToken: string,
    payload: { latitude: number; longitude: number; speed?: number },
  ) {
    if (this.server) {
      this.server.to(`track_${trackingToken}`).emit('location_update', payload);
      this.server.emit(`location_update_${trackingToken}`, payload);
    }
  }
}
