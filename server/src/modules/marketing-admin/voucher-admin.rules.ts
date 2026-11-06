import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import type { VoucherDoc } from '../vouchers/voucher.model.js';
import { voucherStatus, type VoucherStatus } from './effective-status.js';

/** Quy tắc FR-008/009/010. Hàm thuần để test không cần DB. */

const DAY = 86_400_000;
const k = (n: number) => n % 1000 === 0;
const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

export const DISABLE_REASONS = ['LEAKED_OR_ABUSED', 'WRONG_CONFIG', 'EARLY_END', 'OTHER'] as const;
export type DisableReason = (typeof DISABLE_REASONS)[number];

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, 'Mã gồm 4–20 ký tự, chỉ chứa chữ cái không dấu và số.');

// ponytail: FREE_SHIPPING chưa có (pricing.ts/order chưa có khoản giảm phí ship), thêm khi sửa checkout.
const fields = {
  name: z.string().trim().min(5).max(100),
  description: z.string().trim().min(10).max(200),
  discountType: z.enum(['PERCENT', 'FIXED_AMOUNT']),
  discountValue: z.number().int(),
  maxDiscountValue: z.number().int().nullish(),
  minOrderValue: z.number().int().min(0).optional(),
  scope: z
    .object({ productId: z.string().optional(), categoryId: z.string().optional() })
    .array()
    .optional(),
  customerGroup: z.enum(['ALL', 'NEW_CUSTOMER', 'ACCOUNT']).optional(),
  totalUsageLimit: z.number().int().min(1).max(1_000_000),
  perUserLimit: z.number().int().min(1).max(100),
  startNow: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  stackableWithPromotion: z.boolean().optional(),
  /** Xác nhận lần hai cho mã lớn (> 1.000.000đ giảm tối đa hoặc > 10.000 lượt). */
  confirmLarge: z.boolean().optional(),
};

export const createVoucherSchema = z.object({ code, ...fields });
export type CreateVoucherInput = z.infer<typeof createVoucherSchema>;

/** Sửa: mọi trường tùy chọn (trừ `code` bị khóa), kèm `version` cho khóa lạc quan. */
export const updateVoucherSchema = z
  .object(fields)
  .partial()
  .extend({ version: z.number().int().min(0), confirmChange: z.boolean().optional() });

/** Giá trị mặc định (để schema sửa không tự sinh giá trị làm sai phép so sánh "đã đổi"). */
export const withDefaults = (v: CreateVoucherInput) => ({
  ...v,
  minOrderValue: v.minOrderValue ?? 0,
  scope: v.scope ?? [],
  customerGroup: v.customerGroup ?? ('ALL' as const),
  visibility: v.visibility ?? ('PUBLIC' as const),
  stackableWithPromotion: v.stackableWithPromotion ?? true,
  startNow: v.startNow ?? false,
});

export const disableSchema = z.object({
  ids: z.array(z.string()).min(1),
  reason: z.enum(DISABLE_REASONS),
  note: z.string().trim().max(500).optional(),
});
export const enableSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  version: z.number().int().optional(),
});

/** Ghi chú bắt buộc (10–500 ký tự) khi lý do là "Khác" hoặc "Mã bị lộ / lạm dụng". */
export function checkDisableNote(reason: DisableReason, note?: string): void {
  const need = reason === 'OTHER' || reason === 'LEAKED_OR_ABUSED';
  if (need && (!note || note.length < 10)) {
    throw err('E-MKT-010-01', 'Vui lòng chọn lý do và nhập ghi chú (nếu bắt buộc).');
  }
}

/** Kiểm tra chéo giữa các trường (E-MKT-008-04…07), dùng cho dữ liệu đã gộp đủ trường. */
export function checkVoucherValues(
  v: Pick<
    ReturnType<typeof withDefaults>,
    | 'discountType'
    | 'discountValue'
    | 'maxDiscountValue'
    | 'minOrderValue'
    | 'scope'
    | 'totalUsageLimit'
    | 'perUserLimit'
    | 'visibility'
  > & { startDate: Date; endDate: Date },
): void {
  if (v.discountType === 'PERCENT') {
    if (v.discountValue < 1 || v.discountValue > 90) {
      throw err('E-MKT-008-04', 'Mức giảm phần trăm phải từ 1% đến 90%.');
    }
    if (!v.maxDiscountValue || v.maxDiscountValue < 1000 || !k(v.maxDiscountValue)) {
      throw err('E-MKT-008-04', 'Mức giảm tối đa phải là bội số của 1.000 và từ 1.000 trở lên.');
    }
  } else if (
    v.discountValue < 1000 ||
    !k(v.discountValue) ||
    v.minOrderValue <= 0 ||
    v.discountValue >= v.minOrderValue
  ) {
    throw err(
      'E-MKT-008-04',
      'Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu và là bội số của 1.000',
    );
  }
  if (!k(v.minOrderValue)) throw err('E-MKT-008-01', 'Đơn tối thiểu phải là bội số của 1.000.');
  if (v.perUserLimit > v.totalUsageLimit) {
    throw err('E-MKT-008-05', 'Số lượt mỗi khách không được lớn hơn tổng lượt sử dụng.');
  }
  if (v.endDate <= v.startDate || v.endDate.getTime() - v.startDate.getTime() > 365 * DAY) {
    throw err('E-MKT-008-06', 'Thời gian bắt đầu không được ở quá khứ; thời hạn tối đa 365 ngày.');
  }
  const cats = v.scope.filter((s) => s.categoryId).length;
  const prods = v.scope.filter((s) => s.productId).length;
  if (v.scope.some((s) => !!s.categoryId === !!s.productId) || cats > 20 || prods > 500) {
    throw err('E-MKT-008-07', 'Vui lòng chọn ít nhất một danh mục/sản phẩm áp dụng.');
  }
}

/** Xác nhận lần hai + cờ nhật ký cho mã lớn (FR-008). */
export function isLargeVoucher(v: {
  discountType: string;
  discountValue: number;
  maxDiscountValue?: number | null;
  totalUsageLimit?: number | null;
}): boolean {
  const maxGive = v.discountType === 'PERCENT' ? v.maxDiscountValue : v.discountValue;
  return (maxGive ?? 0) > 1_000_000 || (v.totalUsageLimit ?? 0) > 10_000;
}

/** Ngày bắt đầu: "bắt đầu ngay" hoặc ≥ hiện tại (cho lệch 1 phút do gõ form). */
export function resolveStart(input: { startNow: boolean; startDate?: Date }, now: Date): Date {
  if (input.startNow) return now;
  if (!input.startDate) throw err('E-MKT-008-01', 'Vui lòng nhập Thời gian bắt đầu.');
  if (input.startDate.getTime() < now.getTime() - 60_000) {
    throw err('E-MKT-008-06', 'Thời gian bắt đầu không được ở quá khứ; thời hạn tối đa 365 ngày.');
  }
  return input.startDate;
}

const LOCKED_WHEN_USED = [
  'discountType',
  'scope',
  'customerGroup',
  'startDate',
  'startNow',
] as const;
const LABEL: Record<string, string> = {
  discountType: 'Loại giảm',
  scope: 'Phạm vi',
  customerGroup: 'Đối tượng khách',
  startDate: 'Thời gian bắt đầu',
  code: 'Mã',
};
const TEXT_ONLY = ['name', 'description'];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Quy tắc sửa FR-009. `patch` chỉ chứa các trường người dùng gửi. Trả về danh sách trường đã đổi
 * (để ghi nhật ký) và `needsConfirm` nếu đổi giá trị giảm khi đã có lượt dùng.
 */
export function checkEdit(
  v: VoucherDoc,
  patch: Record<string, unknown>,
  now: Date,
): { changed: string[]; needsConfirm: boolean } {
  const status: VoucherStatus = voucherStatus(v, now);
  const used = v.usedCount > 0;
  const current: Record<string, unknown> = {
    ...v,
    scope: v.scope.map((s) => ({
      productId: s.productId?.toString(),
      categoryId: s.categoryId?.toString(),
    })),
    startNow: false,
  };
  const changed = Object.keys(patch).filter(
    (key) => key !== 'version' && key !== 'confirmChange' && !same(patch[key], current[key]),
  );

  if (changed.includes('code')) throw err('E-MKT-009-01', `Không thể sửa ${LABEL['code']}.`);
  if (status === 'EXPIRED' || status === 'DISABLED') {
    if (changed.some((key) => !TEXT_ONLY.includes(key))) {
      const label = status === 'EXPIRED' ? 'hết hạn' : 'bị vô hiệu hóa';
      throw err('E-MKT-009-04', `Mã đã ${label}, chỉ có thể sửa tên và mô tả.`);
    }
    return { changed, needsConfirm: false };
  }
  if (used) {
    for (const key of LOCKED_WHEN_USED) {
      if (changed.includes(key)) {
        throw err('E-MKT-009-01', `Không thể sửa ${LABEL[key]} vì mã đã được sử dụng.`);
      }
    }
  }
  const total = patch['totalUsageLimit'];
  if (typeof total === 'number' && total < v.usedCount) {
    throw err(
      'E-MKT-009-02',
      `Tổng lượt sử dụng không được nhỏ hơn số lượt đã dùng (${v.usedCount}).`,
    );
  }
  const per = patch['perUserLimit'];
  if (used && typeof per === 'number' && per < v.perUserLimit) {
    throw err('E-MKT-009-03', 'Chỉ được tăng số lượt mỗi khách khi mã đã được sử dụng.');
  }
  const end = patch['endDate'];
  if (used && end instanceof Date && end < now) {
    throw err('E-MKT-008-06', 'Thời gian kết thúc không được ở quá khứ.');
  }
  const valueFields = ['discountValue', 'maxDiscountValue', 'minOrderValue'];
  const needsConfirm = used && changed.some((key) => valueFields.includes(key));
  return { changed, needsConfirm };
}

/** Cờ cảnh báo ở danh sách: dùng ≥ 90% lượt hoặc còn < 24 giờ (chỉ khi đang hiệu lực). */
export function warnFlags(
  v: Pick<VoucherDoc, 'usedCount' | 'totalUsageLimit' | 'endDate'>,
  status: VoucherStatus,
  now: Date,
): ('NEAR_LIMIT' | 'ENDING_SOON')[] {
  if (status !== 'ACTIVE') return [];
  const flags: ('NEAR_LIMIT' | 'ENDING_SOON')[] = [];
  if (v.totalUsageLimit && v.usedCount / v.totalUsageLimit >= 0.9) flags.push('NEAR_LIMIT');
  if (v.endDate.getTime() - now.getTime() < DAY) flags.push('ENDING_SOON');
  return flags;
}

/** Thứ tự sắp xếp mặc định FR-007. */
export const STATUS_ORDER: VoucherStatus[] = [
  'ACTIVE',
  'UPCOMING',
  'USED_UP',
  'EXPIRED',
  'DISABLED',
];
