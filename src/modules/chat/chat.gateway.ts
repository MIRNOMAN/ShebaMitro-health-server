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
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ChatService } from './chat.service.js';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { TypingEventDto } from './dto/typing-event.dto.js';
import { MessageDeliveredDto } from './dto/message-delivered.dto.js';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      email: string;
      role: string;
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Configure Socket.io Redis Adapter
   */
  afterInit(server: Server) {
    const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    try {
      const pubClient = new Redis({ host, port, lazyConnect: true });
      const subClient = pubClient.duplicate();

      pubClient.connect().catch((err) => {
        this.logger.warn(`Redis pubClient connect failed: ${err.message}`);
      });
      subClient.connect().catch((err) => {
        this.logger.warn(`Redis subClient connect failed: ${err.message}`);
      });

      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('ChatGateway initialized with Redis adapter');
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis adapter for ChatGateway: ${err.message}`);
    }
  }

  /**
   * Authenticate socket connections via JWT handshake
   */
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

      this.logger.log(
        `Socket connected & authenticated: client ID ${client.id}, user ID ${payload.sub}`,
      );
    } catch (err: any) {
      this.logger.warn(`Socket connection ${client.id} failed JWT auth: ${err.message}`);
      client.emit('error', { message: 'Unauthorized socket connection' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Socket client disconnected: ${client.id}`);
  }

  /**
   * Helper to retrieve authenticated user ID from socket
   */
  private getAuthenticatedUserId(client: AuthenticatedSocket): string {
    const userId = client.data?.user?.id;
    if (!userId) {
      throw new WsException('Unauthorized. User session missing from socket connection.');
    }
    return userId;
  }

  /**
   * Dynamic room name format: "room:appointment:{id}"
   */
  private getRoomName(appointmentId: string): string {
    return `room:appointment:${appointmentId}`;
  }

  /**
   * Event: "join-room"
   */
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    // Ensure only assigned doctor and patient can access the room
    await this.chatService.validateAppointmentAccess(userId, payload.appointmentId);

    const roomName = this.getRoomName(payload.appointmentId);
    client.join(roomName);

    // Fetch conversation history from Message table
    const messages = await this.chatService.getRoomMessages(payload.appointmentId);

    this.logger.log(`User ${userId} joined appointment room ${roomName}`);

    client.emit('room-joined', {
      appointmentId: payload.appointmentId,
      room: roomName,
      messages,
    });

    return { event: 'room-joined', data: { appointmentId: payload.appointmentId, roomName } };
  }

  /**
   * Event: "send-message"
   */
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessageDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    // Ensure only assigned doctor and patient can send messages
    await this.chatService.validateAppointmentAccess(userId, payload.appointmentId);

    // Save conversation message to database
    const savedMessage = await this.chatService.saveMessage(
      userId,
      payload.appointmentId,
      payload.content,
      payload.fileUrl,
    );

    const roomName = this.getRoomName(payload.appointmentId);

    // Broadcast message to room members
    this.server.to(roomName).emit('send-message', savedMessage);
    this.server.to(roomName).emit('new-message', savedMessage);

    // Emit message-delivered status
    const deliveredPayload = {
      messageId: savedMessage.id,
      appointmentId: payload.appointmentId,
      deliveredAt: savedMessage.createdAt,
    };

    this.server.to(roomName).emit('message-delivered', deliveredPayload);

    return { event: 'message-sent', data: savedMessage };
  }

  /**
   * Event: "message-delivered"
   */
  @SubscribeMessage('message-delivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: MessageDeliveredDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    await this.chatService.validateAppointmentAccess(userId, payload.appointmentId);

    const updated = await this.chatService.markMessageDelivered(
      payload.messageId,
      payload.appointmentId,
    );

    const roomName = this.getRoomName(payload.appointmentId);
    const deliveredEventPayload = {
      messageId: payload.messageId,
      appointmentId: payload.appointmentId,
      isRead: true,
      updatedAt: updated?.updatedAt || new Date().toISOString(),
    };

    this.server.to(roomName).emit('message-delivered', deliveredEventPayload);

    return { event: 'message-delivered', data: deliveredEventPayload };
  }

  /**
   * Event: "typing-start"
   */
  @SubscribeMessage('typing-start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingEventDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    await this.chatService.validateAppointmentAccess(userId, payload.appointmentId);

    const roomName = this.getRoomName(payload.appointmentId);
    client.to(roomName).emit('typing-start', {
      appointmentId: payload.appointmentId,
      userId,
    });
  }

  /**
   * Event: "typing-stop"
   */
  @SubscribeMessage('typing-stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingEventDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    await this.chatService.validateAppointmentAccess(userId, payload.appointmentId);

    const roomName = this.getRoomName(payload.appointmentId);
    client.to(roomName).emit('typing-stop', {
      appointmentId: payload.appointmentId,
      userId,
    });
  }

  /**
   * Broadcast file attachment / message over room:appointment:{id}
   */
  broadcastNewMessage(appointmentId: string, message: any) {
    const roomName = this.getRoomName(appointmentId);
    this.logger.log(`Broadcasting file metadata message over WebSocket room: ${roomName}`);
    if (this.server) {
      this.server.to(roomName).emit('send-message', message);
      this.server.to(roomName).emit('new-message', message);
    }
  }

  /**
   * Broadcast read-receipts over room:appointment:{id}
   */
  broadcastReadReceipts(appointmentId: string, readByUserId: string, count: number) {
    const roomName = this.getRoomName(appointmentId);
    this.logger.log(
      `Broadcasting read-receipts over WebSocket room: ${roomName} (count: ${count})`,
    );
    if (this.server) {
      const payload = {
        appointmentId,
        readByUserId,
        readCount: count,
        isRead: true,
        readAt: new Date().toISOString(),
      };
      this.server.to(roomName).emit('message-delivered', payload);
      this.server.to(roomName).emit('read-receipts', payload);
    }
  }
}
