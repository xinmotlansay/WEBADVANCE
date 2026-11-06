import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import {
  VoucherApi,
  type CategoryOption,
  type VoucherBody,
  type VoucherDetail,
} from '../../../services/marketing/voucher.service';

interface Model {
  code: string;
  name: string;
  description: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number | null;
  maxDiscountValue: number | null;
  minOrderValue: number;
  categoryIds: string[];
  customerGroup: 'ALL' | 'NEW_CUSTOMER' | 'ACCOUNT';
  totalUsageLimit: number | null;
  perUserLimit: number | null;
  startNow: boolean;
  startDate: string;
  endDate: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  stackableWithPromotion: boolean;
}

const blank = (): Model => ({
  code: '',
  name: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: null,
  maxDiscountValue: null,
  minOrderValue: 0,
  categoryIds: [],
  customerGroup: 'ALL',
  totalUsageLimit: null,
  perUserLimit: 1,
  startNow: true,
  startDate: '',
  endDate: '',
  visibility: 'PUBLIC',
  stackableWithPromotion: true,
});

/** `yyyy-MM-ddTHH:mm` theo giờ máy, đúng định dạng của `datetime-local`. */
const toLocal = (iso: string): string => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** FR-MKT_AD-008/009: tạo và sửa mã giảm giá; trường bị khóa hiện chỉ đọc kèm lý do. */
@Component({
  selector: 'app-voucher-form',
  imports: [FormsModule, RouterLink],
  templateUrl: './voucher-form.component.html',
  styleUrl: './voucher-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoucherFormComponent {
  private readonly api = inject(VoucherApi);
  private readonly router = inject(Router);

  /** Từ tham số route `:id`; không có là tạo mới. */
  readonly id = input<string>();

  protected m = blank();
  private original: Model | null = null;
  private version = 0;
  protected readonly detail = signal<VoucherDetail | null>(null);
  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly created = signal<string | null>(null);

  /** Lý do khóa từng nhóm trường (FR-009); `null` là sửa được. */
  protected lockReason(group: 'used' | 'code' | 'start'): string | null {
    const d = this.detail();
    if (!d) return null;
    if (group === 'code') return 'Không thể sửa mã sau khi tạo.';
    if (d.status === 'EXPIRED' || d.status === 'DISABLED') {
      return d.status === 'EXPIRED'
        ? 'Mã đã hết hạn, chỉ có thể sửa tên và mô tả.'
        : 'Mã đã bị vô hiệu hóa, chỉ có thể sửa tên và mô tả.';
    }
    return d.usedCount > 0 ? 'Không thể sửa vì mã đã được sử dụng.' : null;
  }

  protected get ended(): boolean {
    const s = this.detail()?.status;
    return s === 'EXPIRED' || s === 'DISABLED';
  }

  constructor() {
    queueMicrotask(() => void this.init());
  }

  private async init(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.api.categories()).catch(() => []));
      const id = this.id();
      if (id) {
        const d = await firstValueFrom(this.api.get(id));
        this.detail.set(d);
        this.version = d.version;
        this.m = {
          code: d.code,
          name: d.name ?? '',
          description: d.description,
          discountType: d.discountType,
          discountValue: d.discountValue,
          maxDiscountValue: d.maxDiscountValue,
          minOrderValue: d.minOrderValue,
          categoryIds: d.scope.flatMap((s) => (s.categoryId ? [s.categoryId] : [])),
          customerGroup: d.customerGroup === 'BIRTHDAY_MONTH' ? 'ALL' : d.customerGroup,
          totalUsageLimit: d.totalUsageLimit,
          perUserLimit: d.perUserLimit,
          startNow: false,
          startDate: toLocal(d.startDate),
          endDate: toLocal(d.endDate),
          visibility: d.visibility,
          stackableWithPromotion: d.stackableWithPromotion,
        };
        this.original = structuredClone(this.m);
      }
    } catch (e) {
      this.loadError.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected randomCode(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    this.m.code = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  protected toggleCategory(id: string): void {
    const set = new Set(this.m.categoryIds);
    if (!set.delete(id)) set.add(id);
    this.m.categoryIds = [...set];
  }

  private body(): VoucherBody {
    const m = this.m;
    const full: VoucherBody = {
      name: m.name.trim(),
      description: m.description.trim(),
      discountType: m.discountType,
      discountValue: m.discountValue,
      maxDiscountValue: m.discountType === 'PERCENT' ? m.maxDiscountValue : null,
      minOrderValue: m.minOrderValue,
      scope: m.categoryIds.map((categoryId) => ({ categoryId })),
      customerGroup: m.customerGroup,
      totalUsageLimit: m.totalUsageLimit,
      perUserLimit: m.perUserLimit,
      endDate: m.endDate ? new Date(m.endDate).toISOString() : undefined,
      visibility: m.visibility,
      stackableWithPromotion: m.stackableWithPromotion,
    };
    if (!this.detail()) {
      full['code'] = m.code.trim();
      full['startNow'] = m.startNow;
      if (!m.startNow && m.startDate) full['startDate'] = new Date(m.startDate).toISOString();
      return full;
    }
    // Sửa: chỉ gửi trường đã đổi để server không coi trường bị khóa là thay đổi.
    const o = this.original!;
    const keys: [keyof Model, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['discountType', 'discountType'],
      ['discountValue', 'discountValue'],
      ['maxDiscountValue', 'maxDiscountValue'],
      ['minOrderValue', 'minOrderValue'],
      ['categoryIds', 'scope'],
      ['customerGroup', 'customerGroup'],
      ['totalUsageLimit', 'totalUsageLimit'],
      ['perUserLimit', 'perUserLimit'],
      ['endDate', 'endDate'],
      ['visibility', 'visibility'],
      ['stackableWithPromotion', 'stackableWithPromotion'],
    ];
    const patch: VoucherBody = { version: this.version };
    for (const [mk, bk] of keys) {
      if (JSON.stringify(m[mk]) !== JSON.stringify(o[mk])) patch[bk] = full[bk];
    }
    if (m.startDate !== o.startDate && m.startDate)
      patch['startDate'] = new Date(m.startDate).toISOString();
    return patch;
  }

  protected async save(form: NgForm): Promise<void> {
    this.error.set('');
    if (form.invalid) {
      const n = Object.values(form.controls).filter((c) => c.invalid).length;
      this.error.set(`Còn ${n} ô chưa hợp lệ (viền đỏ). Sửa rồi bấm lại.`);
      document.querySelector<HTMLElement>('form .ng-invalid:not(form)')?.focus();
      return;
    }
    this.busy.set(true);
    const body = this.body();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const id = this.id();
          const saved = await firstValueFrom(
            id ? this.api.update(id, body) : this.api.create(body),
          );
          if (id) void this.router.navigate(['/marketing/ma-giam-gia']);
          else this.created.set(saved.code);
          return;
        } catch (e) {
          // 409 CONFIRM_REQUIRED: hỏi xác nhận lần hai rồi gửi lại kèm cờ xác nhận.
          const err = parseApiError(e);
          if (
            err.code !== 'CONFIRM_REQUIRED' ||
            !(e instanceof HttpErrorResponse) ||
            !confirm(err.message)
          ) {
            throw e;
          }
          body[this.id() ? 'confirmChange' : 'confirmLarge'] = true;
        }
      }
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* người dùng tự chọn và sao chép */
    }
  }
}
