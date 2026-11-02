import { Injectable, inject } from '@angular/core';
import { ToastService } from '../../shared/ui/toast';

/** Thông báo của các màn Order Admin, hiển thị qua toast chung của khung admin. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toast = inject(ToastService);

  show(text: string, tone: 'info' | 'error' = 'info'): void {
    this.toast.show(text, tone === 'error' ? 'error' : 'ok');
  }
}
