import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { CallStateDto, CallTelemetryPingDto } from './dto/teleconsult-telemetry.dto.js';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      email: string;
      role: string;
    };
  };
}

interface CallSession {
  appointmentId: string;
  startTime: number;
  participants: Map<string, { socketId: string; userId: string; role: string; state: string; joinedAt: number }>;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/teleconsult',
})
export class TeleconsultGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TeleconsultGateway.name);
  private readonly callSessions = new Map<string, CallSession>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    this.logger.log('TeleconsultGateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const authHeader = client.handshake.headers?.authorization;
      const token =
        client.handshake.auth?.token ||
        (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.substring(7)
          : null) ||
        (typeof client.handshake.query?.token === 'string'
          ? client.handshake.query.token
          : null);

      if (!token) {
        throw new WsException('Authentication token missing from connection handshake');
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      client.data.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      this.logger.log(`Teleconsult socket connected: ${client.id}, user: ${payload.sub}`);
    } catch (err: any) {
      this.logger.warn(`Teleconsult socket connection failed auth: ${err.message}`);
      client.emit('error', { message: 'Unauthorized teleconsult connection' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data?.user?.id;
    this.logger.log(`Teleconsult socket disconnected: ${client.id} (user: ${userId})`);

    // Clean up or transition state for disconnected call sessions
    if (userId) {
      for (const [appointmentId, session] of this.callSessions.entries()) {
        const participant = session.participants.get(userId);
        if (participant && participant.socketId === client.id) {
          participant.state = 'DISCONNECTED';
          const roomName = `teleconsult_${appointmentId}`;

          this.server.to(roomName).emit('call-state-changed', {
            appointmentId,
            userId,
            state: 'DISCONNECTED',
            timestamp: new Date().toISOString(),
            reason: 'Socket disconnection',
          });

          this.emitLiveTelemetry(appointmentId);
        }
      }
    }
  }

  private getUserId(client: AuthenticatedSocket): string {
    const userId = client.data?.user?.id;
    if (!userId) {
      throw new WsException('Unauthorized. User session missing from socket.');
    }
    return userId;
  }

  private getRoomName(appointmentId: string): string {
    return `teleconsult_${appointmentId}`;
  }

  /**
   * Calculate and emit live call duration telemetry to the room
   */
  private emitLiveTelemetry(appointmentId: string) {
    const session = this.callSessions.get(appointmentId);
    if (!session) return;

    const now = Date.now();
    const durationSeconds = Math.max(0, Math.floor((now - session.startTime) / 1000));
    const activeParticipants = Array.from(session.participants.values()).filter(
      (p) => p.state === 'CONNECTED' || p.state === 'RECONNECTED',
    );

    const telemetryPayload = {
      appointmentId,
      liveCallDurationSeconds: durationSeconds,
      activeParticipantCount: activeParticipants.length,
      participants: activeParticipants.map((p) => ({
        userId: p.userId,
        state: p.state,
        joinedAt: new Date(p.joinedAt).toISOString(),
      })),
      timestamp: new Date(now).toISOString(),
    };

    const roomName = this.getRoomName(appointmentId);
    this.server.to(roomName).emit('call-telemetry', telemetryPayload);
  }

  /**
   * Event: "call-join"
   */
  @SubscribeMessage('call-join')
  handleCallJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallStateDto,
  ) {
    const userId = this.getUserId(client);
    const roomName = this.getRoomName(payload.appointmentId);
    client.join(roomName);

    let session = this.callSessions.get(payload.appointmentId);
    if (!session) {
      session = {
        appointmentId: payload.appointmentId,
        startTime: Date.now(),
        participants: new Map(),
      };
      this.callSessions.set(payload.appointmentId, session);
    }

    session.participants.set(userId, {
      socketId: client.id,
      userId,
      role: client.data?.user?.role || 'PATIENT',
      state: 'CONNECTED',
      joinedAt: Date.now(),
    });

    const eventData = {
      appointmentId: payload.appointmentId,
      userId,
      state: 'CONNECTED',
      timestamp: new Date().toISOString(),
    };

    this.server.to(roomName).emit('call-state-changed', eventData);
    this.emitLiveTelemetry(payload.appointmentId);

    return { event: 'call-joined', data: eventData };
  }

  /**
   * Event: "call-reconnect"
   */
  @SubscribeMessage('call-reconnect')
  handleCallReconnect(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallStateDto,
  ) {
    const userId = this.getUserId(client);
    const roomName = this.getRoomName(payload.appointmentId);
    client.join(roomName);

    let session = this.callSessions.get(payload.appointmentId);
    if (!session) {
      session = {
        appointmentId: payload.appointmentId,
        startTime: Date.now(),
        participants: new Map(),
      };
      this.callSessions.set(payload.appointmentId, session);
    }

    session.participants.set(userId, {
      socketId: client.id,
      userId,
      role: client.data?.user?.role || 'PATIENT',
      state: 'RECONNECTED',
      joinedAt: Date.now(),
    });

    const eventData = {
      appointmentId: payload.appointmentId,
      userId,
      state: 'RECONNECTED',
      timestamp: new Date().toISOString(),
    };

    this.server.to(roomName).emit('call-state-changed', eventData);
    this.emitLiveTelemetry(payload.appointmentId);

    return { event: 'call-reconnected', data: eventData };
  }

  /**
   * Event: "call-disconnect" or "call-leave"
   */
  @SubscribeMessage('call-disconnect')
  handleCallDisconnect(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallStateDto,
  ) {
    const userId = this.getUserId(client);
    const roomName = this.getRoomName(payload.appointmentId);

    const session = this.callSessions.get(payload.appointmentId);
    if (session && session.participants.has(userId)) {
      const participant = session.participants.get(userId)!;
      participant.state = 'DISCONNECTED';
    }

    client.leave(roomName);

    const eventData = {
      appointmentId: payload.appointmentId,
      userId,
      state: 'DISCONNECTED',
      reason: payload.reason || 'User left call',
      timestamp: new Date().toISOString(),
    };

    this.server.to(roomName).emit('call-state-changed', eventData);
    this.emitLiveTelemetry(payload.appointmentId);

    return { event: 'call-disconnected', data: eventData };
  }

  /**
   * Event: "call-telemetry-ping" (emits live call duration telemetry)
   */
  @SubscribeMessage('call-telemetry-ping')
  handleTelemetryPing(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallTelemetryPingDto,
  ) {
    this.getUserId(client);
    this.emitLiveTelemetry(payload.appointmentId);
  }
}
