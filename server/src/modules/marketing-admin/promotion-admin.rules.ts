import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { discountFor, type DiscountRule } from '../promotions/promotion.service.js';
import type { PromotionDoc } from '../promotions/promotion.model.js';
import type { PromotionStatus } from './effective-status.js';

/** Quy tắc FR-003→006, hàm thuần để test không cần DB. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

export const PAUSE_REASONS = [
  'OUT_OF_BUDGET',
  'WRONG_CONFIG',
  'PLAN_CHANGED',
  'OUT_OF_STOCK',
  'OTHER',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

const ids = (max: number) => z.array(z.string()).max(max).optional();

/** Mọi trường tùy chọn ở mức schema vì "Lưu nháp" chỉ cần Loại và Tên; kích hoạt kiểm tra đủ. */
export const promotionFields = {
  scopeType: z.enum(['PRODUCT', 'CATEGORY']),
  name: z.string().trim().min(5).max(100),
  description: z.string().trim().max(500).optional(),
  startNow: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  discountType: z.enum(['PERCENT', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().int().optional(),
  maxDiscountValue: z.number().int().nullish(),
  productIds: ids(500),
  categoryIds: ids(20),
  excludedProductIds: ids(200),
};
export const createPromotionSchema = z.object({
  ...promotionFields,
  /** true = Kích hoạt, false = Lưu nháp. */
  activate: z.boolean().default(false),
  confirmHighDiscount: z.boolean().optional(),
  /** "Loại trừ các biến thể trùng" để tiếp tục khi có xung đột. */
  excludeConflicts: z.boolean().optional(),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z
  .object(promotionFields)
  .partial()
  .extend({
    version: z.number().int().min(0),
    activate: z.boolean().optional(),
    confirmHighDiscount: z.boolean().optional(),
    excludeConflicts: z.boolean().optional(),
  });
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export const reasonSchema = z.object({
  reason: z.enum(PAUSE_REASONS),
  note: z.string().trim().max(500).optional(),
});
export const endSchema = reasonSchema.extend({ ids: z.array(z.string()).min(1) });

/** Ghi chú 10–500 ký tự bắt buộc khi lý do là "Khác" hoặc "Sai cấu hình". */
export function checkReason(reason: PauseReason, note?: string): void {
  if ((reason === 'OTHER' || reason === 'WRONG_CONFIG') && (!note || note.length < 10)) {
    throw err('E-MKT-006-02', 'Vui lòng chọn lý do và nhập ghi chú (nếu bắt buộc).');
  }
}

export interface Values {
  scopeType: 'PRODUCT' | 'CATEGORY';
  name: string;
  startDate?: Date;
  endDate?: Date;
  discountType?: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue?: number;
  maxDiscountValue?: number | null;
  productIds?: string[];
  categoryIds?: string[];
}

/** Kích hoạt cần đủ trường (E-MKT-004-01) và ít nhất một sản phẩm/danh mục. */
export function checkRequired(v: Values): void {
  const missing = [
    !v.startDate && 'Thời gian bắt đầu',
    !v.endDate && 'Thời gian kết thúc',
    !v.discountType && 'Kiểu giảm',
    v.discountValue == null && 'Giá trị giảm',
  ].find(Boolean);
  if (missing) throw err('E-MKT-004-01', `Vui lòng nhập ${missing}.`);
  const n = v.scopeType === 'PRODUCT' ? v.productIds?.length : v.categoryIds?.length;
  if (!n) {
    throw err(
      'E-MKT-004-01',
      `Vui lòng chọn ${v.scopeType === 'PRODUCT' ? 'sản phẩm' : 'danh mục'}.`,
    );
  }
}

/** Thời gian: bắt đầu ≥ hiện tại (khi cần), kết thúc ≥ bắt đầu + 1 giờ, tổng ≤ 90 ngày. */
export function checkTimes(start: Date, end: Date, now: Date, checkStart: boolean): void {
  if (checkStart && start.getTime() < now.getTime() - 60_000) {
    throw err('E-MKT-004-02', 'Thời gian bắt đầu không được trước thời điểm hiện tại.');
  }
  const span = end.getTime() - start.getTime();
  if (span < HOUR || span > 90 * DAY) {
    throw err(
      'E-MKT-004-03',
      'Thời gian kết thúc phải sau thời gian bắt đầu ít nhất 1 giờ và chương trình kéo dài tối đa 90 ngày.',
    );
  }
}

/** Mức giảm: % 1–90, số tiền bội số 1.000 và nhỏ hơn giá bán thấp nhất trong phạm vi. */
export function checkDiscount(rule: DiscountRule, minPrice: number | null): void {
  const ok1000 = (n: number) => n >= 1000 && n % 1000 === 0;
  if (rule.discountType === 'PERCENT') {
    if (rule.discountValue < 1 || rule.discountValue > 90) {
      throw err('E-MKT-004-04', 'Mức giảm phần trăm phải từ 1% đến 90%');
    }
    if (rule.maxDiscountValue != null && !ok1000(rule.maxDiscountValue)) {
      throw err('E-MKT-004-04', 'Mức giảm tối đa phải là bội số của 1.000 và từ 1.000 trở lên.');
    }
    return;
  }
  if (!ok1000(rule.discountValue) || (minPrice != null && rule.discountValue >= minPrice)) {
    const price = minPrice != null ? ` (${new Intl.NumberFormat('vi-VN').format(minPrice)} ₫)` : '';
    throw err(
      'E-MKT-004-04',
      `Số tiền giảm phải nhỏ hơn giá bán thấp nhất${price} và là bội số của 1.000.`,
    );
  }
}

export interface PreviewLine {
  price: number;
  finalPrice: number;
  percent: number;
}

export function previewLine(price: number, rule: DiscountRule): PreviewLine {
  const finalPrice = price - discountFor(price, rule);
  return {
    price,
    finalPrice,
    percent: price > 0 ? Math.round(((price - finalPrice) / price) * 100) : 0,
  };
}

/** Có dòng giảm > 50% giá gốc thì phải xác nhận lần hai (AC4). */
export const hasHighDiscount = (lines: PreviewLine[]): boolean => lines.some((l) => l.percent > 50);

export interface Occupant {
  id: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  /** Sản phẩm mà chương trình này thực sự chiếm (đã mở rộng từ danh mục, trừ loại trừ). */
  productIds: Set<string>;
}

/** BR-PROMO-01: sản phẩm nằm trong chương trình khác có thời gian giao nhau. productId → chương trình chiếm. */
export function findConflicts(
  productIds: Iterable<string>,
  others: Occupant[],
  start: Date,
  end: Date,
): Map<string, Occupant> {
  const found = new Map<string, Occupant>();
  const overlapping = others.filter((o) => o.startDate < end && start < o.endDate);
  for (const pid of productIds) {
    const hit = overlapping.find((o) => o.productIds.has(pid));
    if (hit) found.set(pid, hit);
  }
  return found;
}

export function conflictError(
  found: Map<string, Occupant>,
  names: Map<string, string>,
  code = 'E-MKT-004-05',
): AppError {
  const list = [...found]
    .slice(0, 5)
    .map(([pid, o]) => `${names.get(pid) ?? pid} (${o.code ?? o.name})`);
  const more = found.size > 5 ? ` và ${found.size - 5} mục khác` : '';
  const head =
    code === 'E-MKT-006-04'
      ? `Không thể tiếp tục do ${found.size} biến thể đang thuộc chương trình khác: `
      : `Có ${found.size} biến thể đang thuộc chương trình khác trong cùng thời gian: `;
  const tail = code === 'E-MKT-006-04' ? '' : ' Vui lòng loại trừ hoặc điều chỉnh thời gian.';
  return new AppError(code, 409, `${head}${list.join(', ')}${more}.${tail}`, {
    conflicts: [...found].map(([productId, o]) => ({
      productId,
      programCode: o.code,
      programName: o.name,
    })),
  });
}

const FIELD_LABEL: Record<string, string> = {
  scopeType: 'Loại chương trình',
  startDate: 'Thời gian bắt đầu',
  startNow: 'Thời gian bắt đầu',
  discountType: 'Kiểu giảm',
  discountValue: 'Giá trị giảm',
  maxDiscountValue: 'Mức giảm tối đa',
};
const STATUS_LABEL: Record<PromotionStatus, string> = {
  DRAFT: 'Nháp',
  UPCOMING: 'Sắp diễn ra',
  RUNNING: 'Đang diễn ra',
  PAUSED: 'Tạm dừng',
  ENDED: 'Đã kết thúc',
};

/** Bảng khóa trường FR-005 theo trạng thái hiển thị. `changed` là các trường người dùng thật sự đổi. */
export function checkEdit(status: PromotionStatus, changed: string[]): void {
  if (status === 'ENDED') {
    throw err(
      'E-MKT-005-02',
      'Chương trình đã kết thúc, không thể chỉnh sửa. Bạn có thể nhân bản để tạo chương trình mới.',
      409,
    );
  }
  const locked =
    status === 'DRAFT'
      ? []
      : status === 'UPCOMING'
        ? ['scopeType']
        : [
            'scopeType',
            'startDate',
            'startNow',
            'discountType',
            'discountValue',
            'maxDiscountValue',
          ];
  const hit = changed.find((k) => locked.includes(k));
  if (hit) {
    const hint =
      status === 'RUNNING' && hit.startsWith('discount')
        ? ' Hãy kết thúc và nhân bản chương trình.'
        : '';
    throw err(
      'E-MKT-005-01',
      `Không thể sửa ${FIELD_LABEL[hit]} khi chương trình ở trạng thái ${STATUS_LABEL[status]}.${hint}`,
      409,
    );
  }
}

/** Đã từng diễn ra: không cho xóa (FR-006). */
export function hasRun(
  p: Pick<PromotionDoc, 'state' | 'everRan' | 'startDate'>,
  now: Date,
): boolean {
  return !!p.everRan || (p.state !== 'DRAFT' && p.state !== undefined && now >= p.startDate);
}

export type Action = 'delete' | 'pause' | 'resume' | 'end' | 'deactivate';
const ALLOWED: Record<Action, PromotionStatus[]> = {
  delete: ['DRAFT', 'UPCOMING'],
  pause: ['RUNNING'],
  resume: ['PAUSED'],
  end: ['RUNNING', 'PAUSED'],
  deactivate: ['UPCOMING'],
};

/** Chuyển trạng thái hợp lệ (E-COM-07), xóa chương trình đã chạy (E-MKT-006-01), tiếp tục khi hết hạn (E-MKT-006-03). */
export function checkTransition(
  action: Action,
  p: Pick<PromotionDoc, 'state' | 'everRan' | 'startDate' | 'endDate'>,
  status: PromotionStatus,
  now: Date,
): void {
  if (action === 'resume' && p.state === 'PAUSED' && now > p.endDate) {
    throw err('E-MKT-006-03', 'Chương trình đã hết thời gian hiệu lực, không thể tiếp tục.', 409);
  }
  if (action === 'delete' && hasRun(p, now)) {
    throw err(
      'E-MKT-006-01',
      'Chương trình đã phát sinh giao dịch nên không thể xóa. Vui lòng dùng Kết thúc sớm.',
      409,
    );
  }
  if (!ALLOWED[action].includes(status)) {
    throw err(
      'E-COM-07',
      `Không thể thực hiện thao tác này khi chương trình ở trạng thái ${STATUS_LABEL[status]}.`,
      409,
    );
  }
}

/** Mã `KM yyMMdd-xxx` theo giờ Việt Nam; `seq` là số thứ tự trong ngày. */
export function promotionCode(date: Date, seq: number): string {
  const vn = new Date(date.getTime() + 7 * HOUR).toISOString().slice(2, 10).replace(/-/g, '');
  return `KM ${vn}-${String(seq).padStart(3, '0')}`;
}

export const STATUS_ORDER: PromotionStatus[] = ['RUNNING', 'UPCOMING', 'PAUSED', 'DRAFT', 'ENDED'];
