import { Injectable, signal } from '@angular/core';

export interface AdminNotification {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private counter = 0;
  readonly messages = signal<AdminNotification[]>([]);

  show(text: string, tone: 'info' | 'error' = 'info'): void {
    const id = ++this.counter;
    this.messages.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), 4500);
  }

  dismiss(id: number): void {
    this.messages.update((list) => list.filter((item) => item.id !== id));
  }
}
