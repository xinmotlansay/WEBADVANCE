import { Injectable, inject, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected';

type Handler = (payload: never) => void;

/**
 * Một kết nối Socket.IO dùng chung cho toàn app.
 * Token được lấy từ AuthService và làm mới một lần nếu server từ chối.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private refreshing = false;

  readonly status = signal<SocketStatus>('disconnected');

  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    const token = this.auth.accessToken();
    if (!token) {
      return;
    }

    this.status.set('connecting');
    this.socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => this.status.set('connected'));
    this.socket.on('disconnect', () => this.status.set('disconnected'));
    this.socket.on('connect_error', (error: Error) => {
      this.status.set('disconnected');
      void this.handleConnectError(error);
    });

    for (const [event, listeners] of this.handlers) {
      for (const handler of listeners) {
        this.socket.on(event, handler as (...args: unknown[]) => void);
      }
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.status.set('disconnected');
  }

  on<T>(event: string, handler: (payload: T) => void): () => void {
    let listeners = this.handlers.get(event);
    if (!listeners) {
      listeners = new Set();
      this.handlers.set(event, listeners);
    }
    listeners.add(handler as Handler);
    this.socket?.on(event, handler as (...args: unknown[]) => void);

    return () => {
      listeners?.delete(handler as Handler);
      this.socket?.off(event, handler as (...args: unknown[]) => void);
    };
  }

  emit(event: string, payload?: unknown): void {
    this.socket?.emit(event, payload);
  }

  private async handleConnectError(error: Error): Promise<void> {
    if (this.refreshing) return;
    if (!error.message.includes('UNAUTHORIZED') && !error.message.includes('TOKEN_EXPIRED')) {
      return;
    }

    this.refreshing = true;
    try {
      const token = await new Promise<string>((resolve, reject) => {
        this.auth.refreshOnce().subscribe({ next: resolve, error: reject });
      });
      if (this.socket) {
        this.socket.auth = { token };
        this.socket.connect();
      }
    } catch {
      this.status.set('disconnected');
    } finally {
      this.refreshing = false;
    }
  }
}
