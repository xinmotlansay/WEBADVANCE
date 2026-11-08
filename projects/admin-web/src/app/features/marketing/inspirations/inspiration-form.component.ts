import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { PromotionApi, type ProductOption } from '../../../services/marketing/promotion.service';
import { ProductPickerComponent } from '../shared/product-picker.component';
import { money } from '../vouchers/voucher-format';
import {
  InspirationApi,
  MAX_INSPIRATION_PRODUCTS,
  STATUS_BADGE,
  STATUS_LABEL,
  type InspirationBody,
  type InspirationRow,
} from '../../../services/marketing/inspiration.service';

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
          <div class="layout">
          <div class="cv-field slot">
            <span class="label" id="i-img-label">Ảnh không gian</span>
            <label class="frame" [class.frame--empty]="!imageUrl()" [class.frame--off]="uploading()">
              <input
                class="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-labelledby="i-img-label"
                aria-describedby="i-img-hint"
                [disabled]="uploading()"
                (change)="upload($event)"
              />
              @if (imageUrl()) {
                <img [src]="imageUrl()" alt="Ảnh cảm hứng đang chọn" />
              }
              <span class="frame__cta">{{ uploading() ? 'Đang tải ảnh…' : imageUrl() ? 'Đổi ảnh' : '+ Chọn ảnh' }}</span>
            </label>
            <span class="cv-hint" id="i-img-hint">Ảnh dọc tỉ lệ 2:3 · JPG, PNG, WEBP · tối đa 3 MB · cạnh ngắn tối thiểu 800 px.</span>
          </div>

          <div class="main">
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
              <div class="preview__backdrop" aria-hidden="true">
                <div class="preview__panel">
                  <img class="preview__photo" [src]="imageUrl()" alt="" />
                  <div class="preview__info">
                    <h3>MUA SẮM THEO NGUỒN CẢM HỨNG</h3>
                    <ul class="preview__products">
                      @for (id of productIds(); track id) {
                        @let p = names().get(id);
                        <li [class.off]="loaded?.inactiveProductIds?.includes(id)">
                          <span class="preview__thumb"></span>
                          <span class="preview__name">{{ p?.name ?? id }}</span>
                          @if (p) {
                            <span class="preview__price">{{ money(p.priceFrom) }}</span>
                          }
                        </li>
                      }
                    </ul>
                  </div>
                </div>
              </div>
              <p class="cv-hint">Mô phỏng popup khách thấy khi bấm vào ảnh; ô xám là chỗ ảnh sản phẩm.</p>
            </section>
          }
          </div>
          </div>

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
    .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; align-items: start; }
    .main { display: grid; gap: 16px; min-width: 0; }
    .frame {
      position: relative;
      display: block;
      aspect-ratio: 2 / 3;
      overflow: hidden;
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface-alt);
      cursor: pointer;
    }
    .frame--empty { display: grid; place-items: center; border: 1.5px dashed var(--cv-border-strong); }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame__cta { font-weight: 600; font-size: 14px; }
    .frame:not(.frame--empty) .frame__cta {
      position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 8px; border-radius: var(--cv-radius);
      background: rgb(0 0 0 / 0.65); color: #fff; text-align: center; opacity: 0; transition: opacity 0.2s;
    }
    .frame:hover .frame__cta, .frame:has(.file:focus-visible) .frame__cta { opacity: 1; }
    @media (hover: none) { .frame:not(.frame--empty) .frame__cta { opacity: 1; } }
    .frame:has(.file:focus-visible) { outline: 2px solid var(--cv-navy); outline-offset: 2px; }
    .frame--off { opacity: 0.6; cursor: not-allowed; }
    .file { position: absolute; inset: 0; opacity: 0; cursor: inherit; }
    .preview h2 { margin: 0 0 8px; font-size: 15px; }
    .preview__backdrop { display: grid; place-items: center; padding: 20px; border-radius: var(--cv-radius-lg); background: rgb(0 0 0 / 0.55); }
    .preview__panel {
      display: grid;
      grid-template-columns: 130px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      width: 100%;
      max-width: 560px;
      padding: 16px;
      border-radius: 8px;
      background: #fff;
      color: #111;
    }
    .preview__photo { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; background: #eee; }
    .preview__info h3 { margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.01em; }
    .preview__products { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
    .preview__thumb { display: block; aspect-ratio: 1 / 1; background: #e9e9e9; }
    .preview__name { display: block; margin-top: 6px; font-size: 11px; line-height: 1.3; }
    .preview__price { display: block; margin-top: 2px; font-size: 11px; font-weight: 700; }
    .preview__products li.off { text-decoration: line-through; opacity: 0.5; }
    @media (max-width: 720px) {
      .layout { grid-template-columns: 1fr; }
      .slot { max-width: 220px; }
      .preview__products { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
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

  @HostListener('window:keydown.control.s', ['$event'])
  @HostListener('window:keydown.meta.s', ['$event'])
  protected saveShortcut(e: Event): void {
    e.preventDefault();
    if (!this.saving() && !this.uploading()) void this.save();
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
