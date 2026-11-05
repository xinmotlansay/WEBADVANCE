import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { PromotionApi } from '../promotions/promotion.api';
import { ProductPickerComponent } from '../shared/product-picker.component';
import {
  CollectionApi,
  STATUS_BADGE,
  STATUS_LABEL,
  type CollectionBody,
  type CollectionDetail,
  type CollectionImage,
} from './collection.api';
import { HotspotEditorComponent } from './hotspot-editor.component';

export const MAX_IMAGES = 10;

/** MA-07: tạo và sửa collection: thông tin, sản phẩm; khi sửa thêm ảnh + hotspot. */
@Component({
  selector: 'app-collection-form',
  imports: [FormsModule, RouterLink, ProductPickerComponent, HotspotEditorComponent],
  templateUrl: './collection-form.component.html',
  styleUrl: './collection-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionFormComponent {
  private readonly api = inject(CollectionApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(PromotionApi);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;
  protected readonly MAX_IMAGES = MAX_IMAGES;

  protected name = '';
  protected slug = '';
  protected slogan = '';
  protected shortDescription = '';
  protected description = '';
  protected productIds: string[] = [];
  protected readonly images = signal<CollectionImage[]>([]);
  /** Ảnh đang mở trình đặt điểm. */
  protected readonly editing = signal<number | null>(null);
  /** Tên sản phẩm đã chọn, cho ô chọn sản phẩm của hotspot. */
  protected readonly productOptions = signal<{ id: string; name: string }[]>([]);
  private readonly names = new Map<string, string>();
  protected readonly uploading = signal(false);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly slugError = signal('');
  protected loaded: CollectionDetail | null = null;
  /** Bản chụp lúc mở form, để biết người dùng đã sửa gì chưa. */
  private initial = '';
  private saved = false;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.load(id);
    else this.initial = JSON.stringify(this.body());
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const c = (this.loaded = await firstValueFrom(this.api.get(id)));
      this.name = c.name;
      this.slug = c.slug;
      this.slogan = c.slogan;
      this.shortDescription = c.shortDescription;
      this.description = c.description;
      this.productIds = c.productIds;
      this.images.set(c.images);
      void this.productsChanged(c.productIds);
      this.initial = JSON.stringify(this.body());
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  private body(): CollectionBody {
    return {
      name: this.name.trim(),
      slug: this.slug.trim() || undefined,
      slogan: this.slogan.trim(),
      shortDescription: this.shortDescription.trim(),
      description: this.description.trim(),
      productIds: this.productIds,
      // Màn tạo mới chưa có ảnh; không gửi = server giữ nguyên.
      ...(this.loaded ? { images: this.images() } : {}),
    };
  }

  private dirty(): boolean {
    return !this.saved && !this.loading() && JSON.stringify(this.body()) !== this.initial;
  }

  /** Dùng cho `canDeactivate` của route. */
  canLeave(): boolean {
    return !this.dirty() || confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi?');
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }

  protected slugChanged(): boolean {
    return !!this.loaded && this.loaded.status === 'VISIBLE' && this.slug.trim() !== this.loaded.slug;
  }

  protected async productsChanged(ids: string[]): Promise<void> {
    const missing = ids.filter((id) => !this.names.has(id));
    if (missing.length) {
      try {
        for (const p of await firstValueFrom(this.products.products({ ids: missing }))) this.names.set(p.id, p.name);
      } catch {
        // Thiếu tên thì hiện id, vẫn chọn được.
      }
    }
    this.productOptions.set(ids.map((id) => ({ id, name: this.names.get(id) ?? id })));
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.error.set('');
    const room = Math.max(MAX_IMAGES - this.images().length, 0);
    if (files.length > room) this.error.set(`Tối đa ${MAX_IMAGES} ảnh; chỉ tải ${room} ảnh đầu.`);
    this.uploading.set(true);
    try {
      for (const file of files.slice(0, room)) {
        const { url } = await firstValueFrom(this.api.uploadImage(file));
        this.images.update((list) => [
          ...list,
          { url, title: '', description: '', isThumbnail: list.length === 0, hotspots: [] },
        ]);
      }
    } catch (e) {
      this.error.set(parseApiError(e).message || 'Tải ảnh không thành công. Vui lòng thử lại.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected patchImage(i: number, patch: Partial<CollectionImage>): void {
    this.error.set('');
    this.images.update((list) => list.map((img, n) => (n === i ? { ...img, ...patch } : img)));
  }

  protected setThumbnail(i: number): void {
    this.images.update((list) => list.map((img, n) => ({ ...img, isThumbnail: n === i })));
  }

  protected moveImage(i: number, delta: -1 | 1): void {
    this.images.update((list) => {
      const next = [...list];
      [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
      return next;
    });
    this.editing.set(null);
  }

  protected removeImage(i: number): void {
    const img = this.images()[i]!;
    if (img.hotspots.length && !confirm(`Xóa ảnh này cùng ${img.hotspots.length} điểm sản phẩm?`)) return;
    this.images.update((list) => {
      const next = list.filter((_, n) => n !== i);
      // Giữ đúng một ảnh đại diện.
      if (img.isThumbnail && next[0]) next[0] = { ...next[0], isThumbnail: true };
      return next;
    });
    this.editing.set(null);
  }

  /** Điểm chưa gắn sản phẩm sẽ bị server từ chối; báo rõ vị trí cho người dùng. */
  private emptyHotspot(): string {
    for (const [i, img] of this.images().entries()) {
      const n = img.hotspots.findIndex((h) => !h.productId);
      if (n >= 0) return `Ảnh ${i + 1}, điểm ${n + 1} chưa chọn sản phẩm.`;
    }
    return '';
  }

  protected async save(): Promise<void> {
    this.error.set('');
    this.slugError.set('');
    const empty = this.emptyHotspot();
    if (empty) {
      this.error.set(empty);
      return;
    }
    this.saving.set(true);
    try {
      const body = this.body();
      this.saved = true;
      if (this.loaded) {
        await firstValueFrom(this.api.update(this.loaded.id, { ...body, version: this.loaded.version }));
        await this.router.navigate(['/marketing/collection']);
      } else {
        // Tạo xong chuyển sang màn sửa để thêm ảnh ngay.
        const c = await firstValueFrom(this.api.create(body));
        await this.router.navigate(['/marketing/collection', c.id, 'sua']);
      }
    } catch (e) {
      this.saved = false;
      const err = parseApiError(e);
      if (err.code === 'E-MKT-020-01') this.slugError.set(err.message);
      else this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }
}
