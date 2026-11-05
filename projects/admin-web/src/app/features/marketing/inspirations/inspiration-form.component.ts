import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { PromotionApi, type ProductOption } from '../promotions/promotion.api';
import { ProductPickerComponent } from '../shared/product-picker.component';
import { money } from '../vouchers/voucher-format';
import {
  InspirationApi,
  MAX_INSPIRATION_PRODUCTS,
  STATUS_BADGE,
  STATUS_LABEL,
  type InspirationBody,
  type InspirationRow,
} from './inspiration.api';

/** MA-08: tạo/sửa ảnh cảm hứng: 1 ảnh + 1–12 sản phẩm có thứ tự, xem trước popup khách. */
@Component({
  selector: 'app-inspiration-form',
  imports: [RouterLink, ProductPickerComponent],
  template: `
    <main class="cv-main">
      <a class="cv-back" routerLink="/marketing/nguon-cam-hung"><span aria-hidden="true">←</span> Nguồn cảm hứng</a>
      <header class="cv-page-head">
        <h1>{{ loaded ? 'Sửa ảnh cảm hứng' : 'Thêm ảnh cảm hứng' }}</h1>
        @if (loaded) {
          <span class="cv-badge" [class]="STATUS_BADGE[loaded.status]">{{ STATUS_LABEL[loaded.status] }}</span>
        }
      </header>

      @if (loading()) {
        <span class="cv-skeleton sk" aria-busy="true" aria-label="Đang tải"></span>
      } @else {
        <form class="cv-card" (submit)="$event.preventDefault(); save()">
          <div class="cv-field">
            <span class="label" id="i-img-label">Ảnh không gian</span>
            @if (imageUrl()) {
              <img class="img" [src]="imageUrl()" alt="Ảnh cảm hứng đang chọn" />
            }
            <label class="drop" [class.drop--off]="uploading()">
              <input
                class="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-labelledby="i-img-label"
                aria-describedby="i-img-hint"
                [disabled]="uploading()"
                (change)="upload($event)"
              />
              <strong>{{ uploading() ? 'Đang tải ảnh…' : imageUrl() ? 'Đổi ảnh' : '+ Chọn ảnh' }}</strong>
            </label>
            <span class="cv-hint" id="i-img-hint">JPG, PNG, WEBP · tối đa 3 MB · cạnh ngắn tối thiểu 800 px.</span>
          </div>

          <app-product-picker
            label="Sản phẩm xuất hiện trong ảnh"
            inputId="i-products"
            [hint]="'Từ 1 đến ' + MAX + ' sản phẩm. Thứ tự chọn là thứ tự trong popup (' + productIds().length + '/' + MAX + ').'"
            [ids]="productIds()"
            (idsChange)="productsChanged($event)"
          />
          @if (loaded?.inactiveProductIds?.length) {
            <p class="cv-alert cv-alert--warn">
              Có {{ loaded!.inactiveProductIds.length }} sản phẩm đã ngừng bán. Khách sẽ không thấy chúng; nên bỏ khỏi danh sách.
            </p>
          }

          @if (imageUrl() && productIds().length) {
            <section class="preview" aria-labelledby="i-preview">
              <h2 id="i-preview">Xem trước popup</h2>
              <div class="preview__box">
                <img [src]="imageUrl()" alt="" />
                <ol>
                  @for (id of productIds(); track id) {
                    @let p = names().get(id);
                    <li [class.off]="loaded?.inactiveProductIds?.includes(id)">
                      <span>{{ p?.name ?? id }}</span>
                      @if (p) {
                        <span class="cv-muted">từ {{ money(p.priceFrom) }}</span>
                      }
                    </li>
                  }
                </ol>
              </div>
            </section>
          }

          @if (!loaded) {
            <p class="cv-muted">Ảnh mới được lưu ở trạng thái Ẩn. Bấm "Hiển thị" ở danh sách khi đã sẵn sàng.</p>
          }

          <div class="cv-actions-bar">
            @if (error()) {
              <p class="cv-alert" role="alert">{{ error() }}</p>
            }
            <a class="cv-btn" routerLink="/marketing/nguon-cam-hung">Hủy</a>
            <button type="submit" class="cv-btn cv-btn--primary" [disabled]="saving() || uploading()">
              {{ saving() ? 'Đang lưu…' : 'Lưu' }}
            </button>
          </div>
        </form>
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .sk { display: block; height: 240px; }
    .label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 600; }
    .img { display: block; max-width: 100%; max-height: 320px; margin-bottom: 8px; border-radius: var(--cv-radius); }
    .drop {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 56px;
      border: 1.5px dashed var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface-alt);
      cursor: pointer;
    }
    .drop:has(.file:focus-visible) { outline: 2px solid var(--cv-navy); outline-offset: 2px; }
    .drop--off { opacity: 0.6; cursor: not-allowed; }
    .file { position: absolute; inset: 0; opacity: 0; cursor: inherit; }
    .preview h2 { margin: 16px 0 8px; font-size: 15px; }
    .preview__box {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--cv-border);
      border-radius: var(--cv-radius-lg);
    }
    .preview__box img { width: 100%; object-fit: cover; border-radius: var(--cv-radius); }
    .preview__box ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; align-content: start; font-size: 13px; }
    .preview__box li span { display: block; }
    .preview__box li.off { text-decoration: line-through; opacity: 0.6; }
    @media (max-width: 640px) { .preview__box { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspirationFormComponent {
  private readonly api = inject(InspirationApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(PromotionApi);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;
  protected readonly MAX = MAX_INSPIRATION_PRODUCTS;
  protected readonly money = money;

  protected readonly imageUrl = signal('');
  protected readonly productIds = signal<string[]>([]);
  protected readonly names = signal(new Map<string, ProductOption>());
  protected readonly uploading = signal(false);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected loaded: InspirationRow | null = null;
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
      const r = (this.loaded = await firstValueFrom(this.api.get(id)));
      this.imageUrl.set(r.imageUrl);
      this.productIds.set(r.productIds);
      void this.productsChanged(r.productIds);
      this.initial = JSON.stringify(this.body());
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  private body(): InspirationBody {
    return { imageUrl: this.imageUrl(), productIds: this.productIds() };
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

  protected async productsChanged(ids: string[]): Promise<void> {
    this.productIds.set(ids);
    this.error.set(ids.length > this.MAX ? `Tối đa ${this.MAX} sản phẩm mỗi ảnh.` : '');
    const missing = ids.filter((id) => !this.names().has(id));
    if (!missing.length) return;
    try {
      const found = await firstValueFrom(this.products.products({ ids: missing }));
      this.names.update((m) => new Map([...m, ...found.map((p) => [p.id, p] as const)]));
    } catch {
      // Thiếu tên thì hiện id, vẫn chọn được.
    }
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.uploading.set(true);
    try {
      this.imageUrl.set((await firstValueFrom(this.api.uploadImage(file))).url);
    } catch (e) {
      this.error.set(parseApiError(e).message || 'Tải ảnh không thành công. Vui lòng thử lại.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.error.set('');
    if (!this.imageUrl()) return this.error.set('Vui lòng chọn ảnh.');
    if (this.productIds().length > this.MAX) return this.error.set(`Tối đa ${this.MAX} sản phẩm mỗi ảnh.`);
    this.saving.set(true);
    try {
      this.saved = true;
      if (this.loaded) await firstValueFrom(this.api.update(this.loaded.id, { ...this.body(), version: this.loaded.version }));
      else await firstValueFrom(this.api.create(this.body()));
      await this.router.navigate(['/marketing/nguon-cam-hung']);
    } catch (e) {
      this.saved = false;
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
