import { Injectable, inject } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { AdminAuthService } from '../auth/admin-auth.service';

type Handler = (payload: never) => void;

/**
 * Kết nối Socket.IO của admin. Tài khoản agent tự vào phòng `agents` ở server nên nhận mọi
 * tin nhắn và thay đổi phiên chat theo thời gian thực. Token được làm mới một lần nếu server từ chối.
 */
@Injectable({ providedIn: 'root' })
export class AdminSocketService {
  private readonly auth = inject(AdminAuthService);
  private socket: Socket | null = null;
  private refreshing = false;
  private readonly handlers = new Map<string, Set<Handler>>();

  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    const token = this.auth.accessToken();
    if (!token) return;

    this.socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
    });
    this.socket.on('connect_error', (error: Error) => void this.handleConnectError(error));
    for (const [event, listeners] of this.handlers) {
      for (const handler of listeners) this.socket.on(event, handler as (...args: unknown[]) => void);
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Trả về hàm hủy đăng ký. */
  on<T>(event: string, handler: (payload: T) => void): () => void {
    let listeners = this.handlers.get(event);
    if (!listeners) this.handlers.set(event, (listeners = new Set()));
    listeners.add(handler as Handler);
    this.socket?.on(event, handler as (...args: unknown[]) => void);
    return () => {
      listeners.delete(handler as Handler);
      this.socket?.off(event, handler as (...args: unknown[]) => void);
    };
  }

  emit(event: string, payload?: unknown): void {
    this.socket?.emit(event, payload);
  }

  private async handleConnectError(error: Error): Promise<void> {
    if (this.refreshing || !/UNAUTHORIZED|TOKEN_EXPIRED/.test(error.message)) return;
    this.refreshing = true;
    try {
      const token = await new Promise<string>((resolve, reject) =>
        this.auth.refresh().subscribe({ next: resolve, error: reject }),
      );
      if (this.socket) {
        this.socket.auth = { token };
        this.socket.connect();
      }
    } catch {
      /* Hết phiên thì interceptor đưa về trang đăng nhập. */
    } finally {
      this.refreshing = false;
    }
  }
}
