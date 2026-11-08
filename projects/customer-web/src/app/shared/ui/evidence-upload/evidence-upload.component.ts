import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EvidenceUploadService, EvidencePurpose } from 'shared';
import { apiErrorMessage } from '../../../core/api-error';
@Component({
  selector: 'app-evidence-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './evidence-upload.component.html',
  styleUrl: './evidence-upload.component.css',
})
export class EvidenceUploadComponent {
  readonly purpose = input.required<EvidencePurpose>();
  readonly label = input('Hình ảnh/ video minh chứng');
  readonly max = input(6);
  readonly urls = model<string[]>([]);
  readonly busyChange = output<boolean>();
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly api = inject(EvidenceUploadService);
  private readonly destroyRef = inject(DestroyRef);
  protected isVideo(url: string): boolean {
    return /\.(mp4|mov)$/i.test(url);
  }
  protected remove(url: string): void {
    this.urls.update((items) => items.filter((item) => item !== url));
  }
  private queue: File[] = [];

  protected pick(list?: FileList | null): void {
    this.error.set('');
    const room = this.max() - this.urls().length;
    const files = Array.from(list ?? []);
    if (files.length > room) this.error.set(`Chỉ được tải tối đa ${this.max()} tệp.`);
    this.queue = files.slice(0, Math.max(0, room));
    this.next();
  }

  private next(): void {
    const file = this.queue.shift();
    if (!file || this.busy() || this.urls().length >= this.max()) return;
    const types = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!types.includes(file.type)) {
      this.error.set('Định dạng file không được hỗ trợ.');
      return this.next();
    }
    if (!file.size || file.size > (file.type.startsWith('video/') ? 50 : 5) * 1024 * 1024) {
      this.error.set('File rỗng hoặc vượt dung lượng cho phép.');
      return this.next();
    }
    this.busy.set(true);
    this.busyChange.emit(true);
    this.api
      .upload(file, this.purpose())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.urls.update((items) => [...items, result.url]);
          this.done();
          this.next();
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.done();
          this.next();
        },
      });
  }

  private done(): void {
    this.busy.set(false);
    this.busyChange.emit(false);
  }
}
