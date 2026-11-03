import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ProductPickerComponent } from '../shared/product-picker.component';
import { PromotionApi, type PromotionRow } from '../promotions/promotion.api';
import { VoucherApi, type CategoryOption } from '../vouchers/voucher.api';
import {
  BLOCK_LABEL,
  ContentApi,
  type BarData,
  type ContentArea,
  type ContentKey,
  type HomeBlock,
  type LandingRow,
  type SaveAction,
  type VersionRow,
} from './content.api';

const toLocal = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const toIso = (local: string): string => (local ? new Date(local).toISOString() : '');

/** FR-MKT_AD-015: nội dung trang chủ (khối bật/tắt, thứ tự) và thanh thông báo. */
@Component({
  selector: 'app-content-page',
  imports: [DatePipe, FormsModule, RouterLink, ProductPickerComponent],
  templateUrl: './content-page.component.html',
  styleUrl: './content-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentPageComponent {
  private readonly api = inject(ContentApi);
  /** Có slug trên URL = đang sửa một landing page. */
  protected readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug');

  protected readonly LABEL = BLOCK_LABEL;
  protected readonly STATUS = { DRAFT: 'Nháp', SCHEDULED: 'Đã lên lịch', PUBLISHED: 'Đã đăng', HIDDEN: 'Đã ẩn' };
  protected readonly tab = signal<ContentKey>('HOME');
  protected readonly landings = signal<LandingRow[]>([]);
  protected readonly versions = signal<VersionRow[]>([]);
  protected lpName = '';
  protected lpSeoTitle = '';
  protected lpMeta = '';
  protected newName = '';
  protected newSlug = '';
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly blocks = signal<HomeBlock[]>([]);
  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly promotions = signal<PromotionRow[]>([]);
  protected readonly warnings = signal<string[]>([]);
  protected readonly scheduledAt = signal<string | null>(null);
  protected bar: BarData = { enabled: false, text: '', linkUrl: '', startAt: '', endAt: '' };
  protected publishAt = '';
  private version = 0;

  constructor() {
    void firstValueFrom(inject(VoucherApi).categories()).then((c) => this.categories.set(c)).catch(() => undefined);
    void firstValueFrom(inject(PromotionApi).list({ page: 1, limit: 100 }))
      .then((p) => this.promotions.set(p.data))
      .catch(() => undefined);
    void this.load();
  }

  /** Đường dẫn API của khu vực đang sửa. */
  private get path(): string {
    return this.slug ? `landing-pages/${this.slug}` : this.tab();
  }

  protected get editsBlocks(): boolean {
    return !!this.slug || this.tab() === 'HOME';
  }

  protected setTab(k: ContentKey): void {
    this.tab.set(k);
    this.message.set('');
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    try {
      if (this.tab() === 'LANDING' && !this.slug) {
        this.landings.set(await firstValueFrom(this.api.landingList()));
      } else if (this.editsBlocks) {
        const a = await firstValueFrom(this.api.get<{ blocks: HomeBlock[] }>(this.path));
        this.apply(a, (d) => this.blocks.set(d.blocks));
        this.lpName = a.name;
        this.lpSeoTitle = a.seoTitle;
        this.lpMeta = a.metaDescription;
      } else {
        this.apply(await firstValueFrom(this.api.get<BarData>(this.path)), (d) => {
          this.bar = { ...d, startAt: toLocal(d.startAt), endAt: toLocal(d.endAt) };
        });
      }
      if (this.tab() !== 'LANDING' || this.slug) this.versions.set(await firstValueFrom(this.api.versions(this.path)));
    } catch (e) {
      this.loadError.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async createLanding(): Promise<void> {
    this.error.set('');
    try {
      await firstValueFrom(this.api.landingCreate(this.newName, this.newSlug.trim()));
      this.newName = this.newSlug = '';
      await this.load();
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  protected async toggleLanding(l: LandingRow): Promise<void> {
    this.error.set('');
    try {
      await firstValueFrom(this.api.landingHide(l.slug, l.status !== 'HIDDEN'));
      await this.load();
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  protected async restore(v: VersionRow): Promise<void> {
    if (!confirm('Khôi phục thành bản nháp mới? Bản đang đăng không bị thay đổi.')) return;
    this.error.set('');
    try {
      await firstValueFrom(this.api.restore(this.path, v.id, this.version));
      await this.load();
      this.message.set('Đã khôi phục thành bản nháp. Kiểm tra rồi đăng nếu muốn áp dụng.');
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  private apply<T>(a: ContentArea<T>, set: (d: T) => void): void {
    set(a.draft);
    this.version = a.version;
    this.warnings.set(a.warnings);
    this.scheduledAt.set(a.scheduledAt);
  }

  protected move(i: number, by: -1 | 1): void {
    const list = [...this.blocks()];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.blocks.set(list);
  }

  protected async pickImage(b: HomeBlock, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    try {
      b.imageUrl = (await firstValueFrom(this.api.uploadImage(file))).url;
      this.blocks.set([...this.blocks()]);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  protected toggleId(list: string[], id: string): void {
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else list.push(id);
  }

  protected async save(action: SaveAction): Promise<void> {
    this.error.set('');
    this.message.set('');
    if (action === 'SCHEDULE' && !this.publishAt) {
      this.error.set('Vui lòng chọn thời gian đăng.');
      return;
    }
    const data = this.editsBlocks ? { blocks: this.blocks() } : { ...this.bar, startAt: toIso(this.bar.startAt), endAt: toIso(this.bar.endAt) };
    this.saving.set(true);
    try {
      const r = await firstValueFrom(
        this.api.save<unknown>(this.path, {
          ...(this.slug ? { name: this.lpName, seoTitle: this.lpSeoTitle, metaDescription: this.lpMeta } : {}),
          data,
          action,
          publishAt: action === 'SCHEDULE' ? new Date(this.publishAt).toISOString() : undefined,
          version: this.version,
        }),
      );
      this.version = r.version;
      this.warnings.set(r.warnings);
      this.scheduledAt.set(r.scheduledAt);
      this.versions.set(await firstValueFrom(this.api.versions(this.path)));
      this.message.set(
        (action === 'DRAFT' ? 'Đã lưu nháp.' : action === 'PUBLISH' ? 'Đã đăng.' : 'Đã lên lịch đăng.') +
          (r.warning ? ' ' + r.warning : ''),
      );
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
