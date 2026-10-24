import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ImageSearchService, ImageSearchItem } from 'shared';
import { ProductCardComponent } from '../../shared/ui/product-card/product-card.component';
import { Subscription } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import { IconComponent } from '../../shared/ui/icons/icon.component';
@Component({
  selector: 'app-image-search',
  imports: [RouterLink, ProductCardComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-search.component.html',
  styleUrl: './image-search.component.css',
})
export class ImageSearchComponent {
  private readonly api = inject(ImageSearchService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private file?: File;
  protected readonly preview = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly searched = signal(false);
  protected readonly dragging = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly items = signal<ImageSearchItem[]>([]);
  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.preview()) URL.revokeObjectURL(this.preview());
    });
  }
  protected reset(): void {
    this.request?.unsubscribe();
    if (this.preview()) URL.revokeObjectURL(this.preview());
    this.preview.set('');
    this.file = undefined;
    this.items.set([]);
    this.error.set('');
    this.loading.set(false);
    this.searched.set(false);
    this.unavailable.set(false);
    this.dragging.set(false);
  }
  protected select(file?: File): void {
    this.reset();
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error.set('Chỉ hỗ trợ JPG, PNG, WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024 || file.size === 0) {
      this.error.set('Ảnh phải có dung lượng từ 1 byte đến 5 MB.');
      return;
    }
    this.file = file;
    this.preview.set(URL.createObjectURL(file));
  }
  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.select(event.dataTransfer?.files[0]);
  }
  protected search(): void {
    if (!this.file || this.loading()) return;
    this.error.set('');
    this.items.set([]);
    this.loading.set(true);
    this.request = this.api
      .search(this.file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
          this.searched.set(true);
        },
        error: (error: unknown) => {
          this.unavailable.set(error instanceof HttpErrorResponse && error.status === 503);
          this.error.set(
            this.unavailable()
              ? 'Tìm bằng ảnh hiện chưa sẵn sàng. Bạn có thể tìm bằng tên sản phẩm, màu sắc hoặc chất liệu.'
              : apiErrorMessage(error),
          );
          this.loading.set(false);
        },
      });
  }
}
