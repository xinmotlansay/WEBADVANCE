import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CollectionImage, ProductListItem } from 'shared';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';
import { VariantPickerService } from '../../../services/cart/variant-picker.service';
import { CollectionWishlistService } from '../../../services/cart/collection-wishlist.service';

@Component({
  selector: 'app-hotspot-image',
  imports: [RouterLink, VndPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hotspot-image.component.html',
  styleUrl: './hotspot-image.component.css',
  host: { '(document:click)': 'outside($event)' },
})
export class HotspotImageComponent {
  readonly image = input.required<CollectionImage>();
  readonly active = model<string | null>(null);
  protected readonly wishlist = inject(CollectionWishlistService);
  private readonly picker = inject(VariantPickerService);
  private readonly element = inject(ElementRef<HTMLElement>);
  readonly imageHeight = model(0);
  /** Tỉ lệ khung ép cho ảnh (vd. '3 / 4'); bỏ trống thì giữ tỉ lệ gốc. */
  readonly ratio = input<string | null>(null);
  protected readonly imageWidth = signal(0);
  protected readonly natural = signal({ w: 0, h: 0 });
  private readonly sceneImage = viewChild<ElementRef<HTMLImageElement>>('sceneImage');

  constructor() {
    effect((onCleanup) => {
      const image = this.sceneImage()?.nativeElement;
      if (!image) return;
      const observer = new ResizeObserver(() => {
        const box = image.getBoundingClientRect();
        this.imageWidth.set(box.width); this.imageHeight.set(box.height);
      });
      observer.observe(image);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Khóa riêng từng chấm (một sản phẩm có thể xuất hiện ở nhiều ảnh). */
  protected key(index: number): string { return this.image().id + ':' + index; }

  protected loaded(image: HTMLImageElement): void {
    this.natural.set({ w: image.naturalWidth, h: image.naturalHeight });
  }

  /** Vị trí điểm theo px; khi ảnh bị cắt (object-fit: cover) thì quy đổi theo phần ảnh còn hiển thị. */
  protected pos(hotspot: { x: number; y: number }): { left: number; top: number } {
    const { w, h } = this.natural(), width = this.imageWidth(), height = this.imageHeight();
    if (!this.ratio() || !w || !h || !width || !height) return { left: hotspot.x * width, top: hotspot.y * height };
    const scale = Math.max(width / w, height / h);
    return {
      left: hotspot.x * w * scale + (width - w * scale) / 2,
      top: hotspot.y * h * scale + (height - h * scale) / 2,
    };
  }

  /** Thẻ giữ trong khung ảnh; `arrow` là độ lệch để mũi nhọn luôn chỉ đúng tâm chấm. */
  protected card(hotspot: { x: number; y: number }): { left: number; arrow: number } {
    const { left } = this.pos(hotspot), width = this.imageWidth();
    const half = Math.min(152, Math.max(0, (width - 16) / 2));
    const clamped = Math.min(Math.max(left, half + 8), Math.max(half + 8, width - half - 8));
    return { left: clamped, arrow: left - clamped };
  }

  protected outside(event: Event): void {
    const current = this.active();
    // `active` dùng chung giữa nhiều ảnh: chỉ đóng thẻ thuộc ảnh này, tránh ảnh khác đóng nhầm thẻ vừa mở.
    if (current === null || !current.startsWith(this.image().id + ':')) return;
    if (!event.composedPath().includes(this.element.nativeElement)) this.active.set(null);
  }

  protected close(point: HTMLButtonElement): void {
    this.active.set(null); point.focus({ preventScroll: true });
  }

  /** Mở popup chọn mẫu giống nút thêm giỏ ở thẻ sản phẩm. */
  protected addToCart(product: ProductListItem): void {
    this.picker.open({ mode: 'add', slug: product.slug });
  }
}
