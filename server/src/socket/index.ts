import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { ChatTypingEvent } from '../lib/shared-api.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { ChatSenderType, RoleName, UserStatus, type ChatMode } from '../lib/shared-enums.js';
import { ChatSessionModel } from '../modules/chat/chat.model.js';
import { UserModel, type IRole } from '../modules/auth/auth.model.js';

interface SocketUser {
  id: string;
  roleName: RoleName;
}

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  role: RoleName;
}

const AGENT_ROLES: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ORDER_ADMIN];

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToSession(sessionId: string, event: string, payload: unknown): void {
  io?.to(`chat:${sessionId}`).emit(event, payload);
}

export function emitToAgents(event: string, payload: unknown): void {
  io?.to('agents').emit(event, payload);
}

async function authenticate(socket: Socket): Promise<SocketUser> {
  const raw = socket.handshake.auth?.token ?? socket.handshake.headers.authorization;
  const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;

  if (typeof token !== 'string' || !token) {
    throw new Error('UNAUTHORIZED');
  }

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw new Error('UNAUTHORIZED');
  }

  const user = await UserModel.findById(payload.sub).populate<{ roleId: IRole }>('roleId', 'name');
  if (!user || user.status === UserStatus.ANONYMIZED) {
    throw new Error('UNAUTHORIZED');
  }
  if (user.status === UserStatus.LOCKED) {
    throw new Error('ACCOUNT_LOCKED_BY_ADMIN');
  }

  return { id: String(user._id), roleName: user.roleId?.name as RoleName };
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket);
      socket.data.user = user;
      next();
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNAUTHORIZED';
      next(new Error(code));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    socket.join(`user:${user.id}`);

    if (AGENT_ROLES.includes(user.roleName)) {
      socket.join('agents');
    }

    socket.on('chat:join', async (payload: { sessionId?: string } = {}) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) return;

      try {
        const session = await ChatSessionModel.findById(sessionId).select('customerId').lean();
        if (!session) return;

        const isOwner = String(session.customerId) === user.id;
        const isAgent = AGENT_ROLES.includes(user.roleName);
        if (!isOwner && !isAgent) return;

        await socket.join(`chat:${sessionId}`);
      } catch (error) {
        logger.warn({ err: error, sessionId }, 'Không thể join phòng chat');
      }
    });

    socket.on('chat:leave', async (payload: { sessionId?: string } = {}) => {
      if (payload?.sessionId) {
        await socket.leave(`chat:${payload.sessionId}`);
      }
    });

    socket.on(
      'chat:typing',
      (payload: { sessionId?: string; isTyping?: boolean } = {}) => {
        const sessionId = payload?.sessionId;
        if (!sessionId || !socket.rooms.has(`chat:${sessionId}`)) return;

        const event: ChatTypingEvent = {
          sessionId,
          senderType: AGENT_ROLES.includes(user.roleName) ? ChatSenderType.AGENT : ChatSenderType.CUSTOMER,
          isTyping: Boolean(payload.isTyping),
        };
        socket.to(`chat:${sessionId}`).emit('chat:typing', event);
      },
    );
  });

  return io;
}

/** Kiểu dữ liệu gắn vào socket sau khi xác thực, dùng cho các handler mở rộng sau này. */
export interface ChatSocketData {
  user: SocketUser;
  mode?: ChatMode;
}
