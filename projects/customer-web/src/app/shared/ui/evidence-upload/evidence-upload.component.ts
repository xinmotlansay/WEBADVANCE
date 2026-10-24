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
  readonly urls = model<string[]>([]);
  readonly busyChange = output<boolean>();
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
  protected upload(file?: File): void {
    this.error.set('');
    if (!file || this.busy() || this.urls().length >= 6) return;
    const types = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!types.includes(file.type)) {
      this.error.set('Định dạng file không được hỗ trợ.');
      return;
    }
    if (!file.size || file.size > (file.type.startsWith('video/') ? 50 : 5) * 1024 * 1024) {
      this.error.set('File rỗng hoặc vượt dung lượng cho phép.');
      return;
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
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.done();
        },
      });
  }
  private done(): void {
    this.busy.set(false);
    this.busyChange.emit(false);
  }
}
