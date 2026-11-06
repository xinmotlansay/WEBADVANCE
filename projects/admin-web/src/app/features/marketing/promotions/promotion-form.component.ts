import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ProductPickerComponent } from '../shared/product-picker.component';
import { VoucherApi, type CategoryOption } from '../vouchers/voucher.api';
import { money } from '../vouchers/voucher-format';
import {
  PromotionApi,
  type PreviewLine,
  type PromotionBody,
  type PromotionDetail,
} from './promotion.api';
import { PROMO_LABEL } from './promotion-format';

interface Model {
  scopeType: 'PRODUCT' | 'CATEGORY';
  name: string;
  description: string;
  startNow: boolean;
  startDate: string;
  endDate: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number | null;
  maxDiscountValue: number | null;
  productIds: string[];
  categoryIds: string[];
  excludedProductIds: string[];
}

const blank = (): Model => ({
  scopeType: 'PRODUCT',
  name: '',
  description: '',
  startNow: false,
  startDate: '',
  endDate: '',
  discountType: 'PERCENT',
  discountValue: null,
  maxDiscountValue: null,
  productIds: [],
  categoryIds: [],
  excludedProductIds: [],
});

/** `yyyy-MM-ddTHH:mm` theo giờ máy, đúng định dạng của `datetime-local`. */
const toLocal = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const iso = (local: string): string | undefined =>
  local ? new Date(local).toISOString() : undefined;

type Submit = 'draft' | 'activate' | 'save';

/** FR-MKT_AD-004/005: tạo, lưu nháp, kích hoạt, sửa; trường bị khóa hiện chỉ đọc kèm lý do. */
@Component({
  selector: 'app-promotion-form',
  imports: [FormsModule, RouterLink, ProductPickerComponent],
  templateUrl: './promotion-form.component.html',
  styleUrl: './promotion-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionFormComponent {
  private readonly api = inject(PromotionApi);
  private readonly vouchers = inject(VoucherApi);
  private readonly router = inject(Router);

  protected readonly money = money;
  /** Tham số route `:id`; không có là tạo mới. */
  readonly id = input<string>();

  protected m = blank();
  private original: Model | null = null;
  private version = 0;
  protected readonly detail = signal<PromotionDetail | null>(null);
  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly busy = signal(false);
  protected readonly info = signal('');
  protected readonly preview = signal<{ lines: PreviewLine[]; total: number } | null>(null);
  protected readonly previewError = signal('');

  protected get status(): string | null {
    return this.detail()?.status ?? null;
  }
  protected get isDraft(): boolean {
    return !this.id() || this.status === 'DRAFT';
  }
  /** Khóa theo bảng FR-005: Nháp mở hết, Sắp diễn ra khóa loại, Đang diễn ra/Tạm dừng khóa thêm thời gian bắt đầu và mức giảm. */
  protected get lockType(): boolean {
    return !this.isDraft;
  }
  protected get lockValue(): boolean {
    return this.status === 'RUNNING' || this.status === 'PAUSED';
  }
  protected get lockWhy(): string {
    return this.status
      ? `Không thể sửa khi chương trình ở trạng thái ${PROMO_LABEL[this.status as keyof typeof PROMO_LABEL]}.`
      : '';
  }
  protected readonly valueLockWhy =
    'Không thể sửa mức giảm khi chương trình đang diễn ra. Hãy kết thúc và nhân bản chương trình.';

  constructor() {
    queueMicrotask(() => void this.init());
  }

  private async init(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.vouchers.categories()).catch(() => []));
      const id = this.id();
      if (id) {
        const d = await firstValueFrom(this.api.get(id));
        if (d.status === 'ENDED') {
          this.loadError.set(
            'Chương trình đã kết thúc, không thể chỉnh sửa. Bạn có thể nhân bản để tạo chương trình mới.',
          );
          return;
        }
        this.detail.set(d);
        this.version = d.version;
        this.m = {
          scopeType: d.scopeType,
          name: d.name,
          description: d.description,
          startNow: false,
          startDate: toLocal(d.startDate),
          endDate: toLocal(d.endDate),
          discountType: d.discountType ?? 'PERCENT',
          discountValue: d.discountValue,
          maxDiscountValue: d.maxDiscountValue,
          productIds: d.productIds,
          categoryIds: d.categoryIds,
          excludedProductIds: d.excludedProductIds,
        };
        this.original = structuredClone(this.m);
        void this.refreshPreview();
      }
    } catch (e) {
      this.loadError.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleCategory(id: string): void {
    const set = new Set(this.m.categoryIds);
    if (!set.delete(id)) set.add(id);
    this.m.categoryIds = [...set];
  }

  protected setProducts(ids: string[]): void {
    this.m.productIds = ids;
  }
  protected setExcluded(ids: string[]): void {
    this.m.excludedProductIds = ids;
  }

  private scopeBody(): PromotionBody {
    const m = this.m;
    return {
      scopeType: m.scopeType,
      discountType: m.discountType,
      discountValue: m.discountValue ?? undefined,
      maxDiscountValue: m.discountType === 'PERCENT' ? m.maxDiscountValue : null,
      productIds: m.scopeType === 'PRODUCT' ? m.productIds : [],
      categoryIds: m.scopeType === 'CATEGORY' ? m.categoryIds : [],
      excludedProductIds: m.scopeType === 'CATEGORY' ? m.excludedProductIds : [],
    };
  }

  protected async refreshPreview(): Promise<void> {
    this.previewError.set('');
    try {
      this.preview.set(await firstValueFrom(this.api.preview(this.scopeBody())));
    } catch (e) {
      this.preview.set(null);
      this.previewError.set(parseApiError(e).message);
    }
  }

  private body(kind: Submit): PromotionBody {
    const m = this.m;
    const full: PromotionBody = {
      ...this.scopeBody(),
      name: m.name.trim(),
      description: m.description.trim(),
      startNow: m.startNow,
      startDate: m.startNow ? undefined : iso(m.startDate),
      endDate: iso(m.endDate),
    };
    if (!this.id()) return { ...full, activate: kind === 'activate' };

    // Sửa: chỉ gửi trường đã đổi để server không coi trường bị khóa là thay đổi.
    const o = this.original!;
    const patch: PromotionBody = { version: this.version, activate: kind === 'activate' };
    const keys: (keyof Model)[] = [
      'scopeType',
      'name',
      'description',
      'startDate',
      'endDate',
      'discountType',
      'discountValue',
      'maxDiscountValue',
      'productIds',
      'categoryIds',
      'excludedProductIds',
    ];
    for (const k of keys) {
      if (JSON.stringify(m[k]) !== JSON.stringify(o[k])) patch[k] = full[k];
    }
    if (m.startNow) patch['startNow'] = true;
    return patch;
  }

  protected async save(kind: Submit, extra: PromotionBody = {}): Promise<void> {
    this.error.set('');
    this.conflict.set(false);
    this.busy.set(true);
    const body = { ...this.body(kind), ...extra };
    try {
      if (
        this.status === 'RUNNING' &&
        !confirm(
          'Chương trình đang diễn ra: thay đổi áp dụng trên website ngay khi lưu. Bạn chắc chắn?',
        )
      ) {
        return;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const id = this.id();
          const saved = await firstValueFrom(
            id ? this.api.update(id, body) : this.api.create(body),
          );
          if (saved.unchanged) {
            this.info.set('Không có thay đổi nào để lưu.');
            return;
          }
          void this.router.navigate(['/marketing/khuyen-mai']);
          return;
        } catch (e) {
          // 409 CONFIRM_REQUIRED: hỏi xác nhận lần hai rồi gửi lại kèm cờ xác nhận.
          const err = parseApiError(e);
          if (err.code !== 'CONFIRM_REQUIRED' || !confirm(err.message)) throw e;
          body['confirmHighDiscount'] = true;
        }
      }
    } catch (e) {
      const err = parseApiError(e);
      this.error.set(err.message);
      this.conflict.set(err.code === 'E-MKT-004-05');
      this.pendingKind = kind;
    } finally {
      this.busy.set(false);
    }
  }

  private pendingKind: Submit = 'draft';

  /** "Loại trừ các biến thể trùng" rồi thử lại. */
  protected excludeAndRetry(): Promise<void> {
    return this.save(this.pendingKind, { excludeConflicts: true });
  }
}
