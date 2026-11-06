import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { VoucherApi, type CategoryOption } from '../../../services/marketing/voucher.service';
import { BannerApi, type BannerBody, type BannerPosition, type BannerRow } from '../../../services/marketing/banner.service';
import { FREQUENCY_LABEL, POSITION_LABEL, POSITION_ORDER, RECOMMENDED } from './banner-format';

const toLocal = (iso: string): string => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** FR-MKT_AD-012/013: tạo và sửa banner. Vị trí chỉ chọn lúc tạo. */
@Component({
  selector: 'app-banner-form',
  imports: [FormsModule, RouterLink],
  templateUrl: './banner-form.component.html',
  styleUrl: './banner-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BannerFormComponent {
  private readonly api = inject(BannerApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('preview');

  protected readonly POSITIONS = POSITION_ORDER;
  protected readonly POSITION_LABEL = POSITION_LABEL;
  protected readonly RECOMMENDED = RECOMMENDED;
  protected readonly FREQUENCIES = Object.entries(FREQUENCY_LABEL);

  protected position: BannerPosition = 'HOME_SLIDER';
  protected title = '';
  protected content = '';
  protected imageUrl = '';
  protected mobileImageUrl = '';
  protected ctaLabel = '';
  protected linkUrl = '';
  protected openInNewTab: boolean | null = null;
  protected startNow = true;
  protected startDate = '';
  protected endDate = '';
  protected displayOrder = 1;
  protected categoryIds: string[] = [];
  protected popupFrequency: 'SESSION' | 'DAILY' | 'ONCE' = 'SESSION';

  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly uploadError = signal<{ desktop: string; mobile: string }>({ desktop: '', mobile: '' });
  protected readonly uploading = signal('');
  protected readonly previewMobile = signal(false);
  protected loaded: BannerRow | null = null;

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('vi_tri') as BannerPosition | null;
    if (q && this.POSITIONS.includes(q)) this.position = q;
    void firstValueFrom(inject(VoucherApi).categories()).then((c) => this.categories.set(c)).catch(() => undefined);
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.load(id);
  }

  protected get editing(): boolean {
    return !!this.loaded;
  }

  /** Banner hết hạn chỉ được gia hạn thời gian kết thúc. */
  protected get lockedExpired(): boolean {
    return this.loaded?.status === 'EXPIRED';
  }

  protected get isExternal(): boolean {
    return this.linkUrl.startsWith('https://');
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const b = await firstValueFrom(this.api.get(id));
      this.loaded = b;
      this.position = b.position;
      this.title = b.title;
      this.content = b.content;
      this.imageUrl = b.imageUrl;
      this.mobileImageUrl = b.mobileImageUrl ?? '';
      this.ctaLabel = b.ctaLabel ?? '';
      this.linkUrl = b.linkUrl;
      this.openInNewTab = b.openInNewTab;
      this.startNow = false;
      this.startDate = toLocal(b.startDate);
      this.endDate = b.endDate ? toLocal(b.endDate) : '';
      this.displayOrder = b.displayOrder;
      this.categoryIds = b.categoryIds;
      this.popupFrequency = b.popupFrequency ?? 'SESSION';
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async pick(event: Event, kind: 'desktop' | 'mobile'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadError.update((e) => ({ ...e, [kind]: '' }));
    this.uploading.set(kind);
    try {
      const r = await firstValueFrom(this.api.upload(file, this.position, kind));
      if (kind === 'desktop') this.imageUrl = r.url;
      else this.mobileImageUrl = r.url;
    } catch (e) {
      const msg = parseApiError(e).message;
      this.uploadError.update((u) => ({ ...u, [kind]: msg || 'Tải ảnh không thành công. Vui lòng thử lại.' }));
    } finally {
      this.uploading.set('');
    }
  }

  protected toggleCategory(id: string): void {
    this.categoryIds = this.categoryIds.includes(id) ? this.categoryIds.filter((x) => x !== id) : [...this.categoryIds, id];
  }

  protected openPreview(): void {
    this.dialog()?.nativeElement.showModal();
  }

  protected closePreview(): void {
    this.dialog()?.nativeElement.close();
  }

  protected async save(publish: boolean): Promise<void> {
    this.error.set('');
    if (!this.imageUrl || this.title.trim().length === 0) {
      this.error.set('Vui lòng tải ảnh desktop và nhập tiêu đề banner.');
      return;
    }
    if (this.isExternal && !confirm('Liên kết dẫn ra ngoài website. Bạn đã kiểm tra đúng địa chỉ chưa?')) return;
    const body: BannerBody = this.lockedExpired
      ? { endDate: this.endDate ? new Date(this.endDate).toISOString() : null }
      : {
          title: this.title.trim(),
          content: this.content.trim() || undefined,
          imageUrl: this.imageUrl,
          mobileImageUrl: this.mobileImageUrl || null,
          ctaLabel: this.ctaLabel.trim() || null,
          linkUrl: this.linkUrl.trim() || null,
          openInNewTab: this.openInNewTab ?? undefined,
          startNow: this.startNow,
          startDate: !this.startNow && this.startDate ? new Date(this.startDate).toISOString() : undefined,
          endDate: this.endDate ? new Date(this.endDate).toISOString() : null,
          displayOrder: this.displayOrder,
          categoryIds: this.position === 'CATEGORY' ? this.categoryIds : undefined,
          popupFrequency: this.position === 'POPUP' ? this.popupFrequency : undefined,
          publish,
        };
    this.saving.set(true);
    try {
      if (this.loaded) {
        await firstValueFrom(this.api.update(this.loaded.id, { ...body, version: this.loaded.version }));
      } else {
        await firstValueFrom(this.api.create({ ...body, position: this.position }));
      }
      await this.router.navigate(['/marketing/banner']);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
