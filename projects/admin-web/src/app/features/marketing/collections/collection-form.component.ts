import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ProductPickerComponent } from '../shared/product-picker.component';
import { CollectionApi, STATUS_BADGE, STATUS_LABEL, type CollectionBody, type CollectionDetail } from './collection.api';

/** MA-07: tạo và sửa collection (thông tin, sản phẩm). Ảnh + hotspot ở Task 4. */
@Component({
  selector: 'app-collection-form',
  imports: [FormsModule, RouterLink, ProductPickerComponent],
  templateUrl: './collection-form.component.html',
  styleUrl: './collection-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionFormComponent {
  private readonly api = inject(CollectionApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;

  protected name = '';
  protected slug = '';
  protected slogan = '';
  protected shortDescription = '';
  protected description = '';
  protected productIds: string[] = [];

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

  protected async save(): Promise<void> {
    this.error.set('');
    this.slugError.set('');
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
