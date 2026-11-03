import { Types, type QueryFilter } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { OrderModel } from '../orders/order.model.js';
import { VoucherModel, type VoucherDoc } from '../vouchers/voucher.model.js';
import { VoucherUsageModel } from '../vouchers/voucher-usage.model.js';
import { logAdminAction } from './admin-log.js';
import { voucherStatus } from './effective-status.js';
import {
  STATUS_ORDER,
  checkDisableNote,
  checkEdit,
  checkVoucherValues,
  isLargeVoucher,
  resolveStart,
  warnFlags,
  withDefaults,
  type CreateVoucherInput,
  type DisableReason,
  type updateVoucherSchema,
} from './voucher-admin.rules.js';

type Update = z.infer<typeof updateVoucherSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().min(2, 'Vui lòng nhập từ 2 đến 50 ký tự để tìm kiếm.').max(50).optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'USED_UP', 'EXPIRED', 'DISABLED']).optional(),
  discountType: z.enum(['PERCENT', 'FIXED_AMOUNT']).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  /** Mã có thời gian hiệu lực giao với khoảng [from, to]. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => [20, 50, 100].includes(n))
    .default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const conflict = () =>
  new AppError('E-COM-05', 409, 'Mã vừa được người khác cập nhật. Vui lòng tải lại.');
const dupCode = (code: string) =>
  new AppError('E-MKT-008-02', 409, `Mã ${code} đã tồn tại. Vui lòng chọn mã khác.`);

const scopeOut = (v: VoucherDoc) =>
  v.scope.map((s) => ({
    productId: s.productId?.toString(),
    categoryId: s.categoryId?.toString(),
  }));

function toScope(scope: { productId?: string; categoryId?: string }[]): VoucherDoc['scope'] {
  return scope.map((s) => ({
    ...(s.productId ? { productId: new Types.ObjectId(s.productId) } : {}),
    ...(s.categoryId ? { categoryId: new Types.ObjectId(s.categoryId) } : {}),
  }));
}

function toRow(v: VoucherDoc, now: Date) {
  const status = voucherStatus(v, now);
  return {
    id: String(v._id),
    code: v.code,
    name: v.name,
    discountType: v.discountType,
    discountValue: v.discountValue,
    maxDiscountValue: v.maxDiscountValue ?? null,
    minOrderValue: v.minOrderValue ?? 0,
    usedCount: v.usedCount,
    totalUsageLimit: v.totalUsageLimit ?? null,
    startDate: v.startDate,
    endDate: v.endDate,
    visibility: v.visibility ?? 'PUBLIC',
    status,
    flags: warnFlags(v, status, now),
    version: v.version ?? 0,
  };
}

export async function listVouchers(q: ListQuery, now = new Date()) {
  const filter: QueryFilter<VoucherDoc> = { type: { $ne: 'ASSIGNED' } };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ code: rx }, { name: rx }];
  }
  if (q.discountType) filter.discountType = q.discountType;
  if (q.visibility) filter.visibility = q.visibility;
  if (q.from) filter.endDate = { $gte: q.from };
  if (q.to) filter.startDate = { $lte: q.to };

  // ponytail: trạng thái tính lúc đọc nên lọc/sắp/phân trang trong bộ nhớ; chuyển sang aggregation khi > vài nghìn mã.
  const docs = await VoucherModel.find(filter).lean();
  const rows = docs.map((d) => toRow(d, now)).filter((r) => !q.status || r.status === q.status);
  rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.endDate.getTime() - b.endDate.getTime(),
  );
  const total = rows.length;
  return {
    data: rows.slice((q.page - 1) * q.limit, q.page * q.limit),
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}

async function load(id: string): Promise<VoucherDoc> {
  const v = Types.ObjectId.isValid(id)
    ? await VoucherModel.findOne({ _id: id, type: { $ne: 'ASSIGNED' } }).lean()
    : null;
  if (!v) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy mã giảm giá');
  return v;
}

/** Chi tiết: chỉ số liệu tổng hợp, không có danh tính khách (RST-05). */
export async function getVoucher(id: string, now = new Date()) {
  const v = await load(id);
  const [refunded, discount] = await Promise.all([
    VoucherUsageModel.countDocuments({ voucherId: v._id, status: 'USAGE_REFUNDED' }),
    OrderModel.aggregate<{ total: number }>([
      { $match: { voucherId: v._id, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, total: { $sum: '$voucherDiscount' } } },
    ]),
  ]);
  return {
    ...toRow(v, now),
    description: v.description ?? '',
    customerGroup: v.customerGroup,
    stackableWithPromotion: v.stackableWithPromotion,
    scope: scopeOut(v),
    perUserLimit: v.perUserLimit,
    disableReason: v.disableReason ?? null,
    usageRefunded: refunded,
    totalDiscount: discount[0]?.total ?? 0,
  };
}

export async function createVoucher(actorId: string, input: CreateVoucherInput, now = new Date()) {
  const v = withDefaults(input);
  const startDate = resolveStart(v, now);
  checkVoucherValues({ ...v, startDate });
  const large = isLargeVoucher(v);
  if (large && !v.confirmLarge) {
    throw new AppError('CONFIRM_REQUIRED', 409, 'Mã có giá trị lớn, cần xác nhận lần hai.');
  }
  if (await VoucherModel.exists({ code: v.code })) throw dupCode(v.code);
  try {
    const doc = await VoucherModel.create({
      code: v.code,
      name: v.name,
      description: v.description,
      type: 'PUBLIC',
      visibility: v.visibility,
      customerGroup: v.customerGroup,
      stackableWithPromotion: v.stackableWithPromotion,
      discountType: v.discountType,
      discountValue: v.discountValue,
      maxDiscountValue: v.discountType === 'PERCENT' ? v.maxDiscountValue : undefined,
      minOrderValue: v.minOrderValue,
      scope: toScope(v.scope),
      totalUsageLimit: v.totalUsageLimit,
      perUserLimit: v.perUserLimit,
      usedCount: 0,
      startDate,
      endDate: v.endDate,
      status: 'ACTIVE',
    });
    logAdminAction(actorId, 'VOUCHER_CREATE', v.code, { large }, large); // cờ LARGE_DISCOUNT_ACTIVATED
    return await getVoucher(String(doc._id), now);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw dupCode(v.code);
    throw e;
  }
}

export async function updateVoucher(actorId: string, id: string, patch: Update, now = new Date()) {
  const v = await load(id);
  const { version, confirmChange, confirmLarge: _confirm, ...fields } = patch;
  if ((v.version ?? 0) !== version) throw conflict();

  const { changed, needsConfirm } = checkEdit(v, fields, now);
  if (needsConfirm && !confirmChange) {
    throw new AppError(
      'CONFIRM_REQUIRED',
      409,
      'Thay đổi chỉ áp dụng cho lượt dùng sau thời điểm sửa. Vui lòng xác nhận.',
    );
  }
  if (changed.length === 0) return getVoucher(id, now);

  const locked = ['EXPIRED', 'DISABLED'].includes(voucherStatus(v, now));
  const set: Partial<VoucherDoc> = {};
  if (fields.name) set.name = fields.name;
  if (fields.description) set.description = fields.description;

  if (!locked) {
    // Gộp với dữ liệu hiện có rồi kiểm tra lại toàn bộ (E-MKT-009-05 = E-MKT-008-xx).
    const m = withDefaults({
      code: v.code,
      name: v.name ?? '',
      description: v.description ?? '',
      discountType: v.discountType,
      discountValue: v.discountValue,
      maxDiscountValue: v.maxDiscountValue,
      minOrderValue: v.minOrderValue ?? 0,
      scope: scopeOut(v),
      customerGroup: v.customerGroup === 'BIRTHDAY_MONTH' ? 'ALL' : v.customerGroup,
      totalUsageLimit: v.totalUsageLimit ?? 1,
      perUserLimit: v.perUserLimit,
      endDate: v.endDate,
      visibility: v.visibility,
      stackableWithPromotion: v.stackableWithPromotion,
      ...fields,
    });
    const startDate = fields.startNow || fields.startDate ? resolveStart(m, now) : v.startDate;
    checkVoucherValues({ ...m, startDate });
    Object.assign(set, {
      discountType: m.discountType,
      discountValue: m.discountValue,
      maxDiscountValue: m.discountType === 'PERCENT' ? m.maxDiscountValue : undefined,
      minOrderValue: m.minOrderValue,
      scope: toScope(m.scope),
      customerGroup: m.customerGroup,
      totalUsageLimit: m.totalUsageLimit,
      perUserLimit: m.perUserLimit,
      startDate,
      endDate: m.endDate,
      visibility: m.visibility,
      stackableWithPromotion: m.stackableWithPromotion,
      name: m.name,
      description: m.description,
    });
  }

  const res = await VoucherModel.updateOne(
    { _id: id, version: v.version ?? 0 },
    { $set: set, $inc: { version: 1 } },
  );
  if (res.modifiedCount === 0) throw conflict();
  logAdminAction(actorId, 'VOUCHER_UPDATE', v.code, { changed });
  return getVoucher(id, now);
}

/** Vô hiệu hóa hàng loạt (≤ 50). Kiểm tra hết rồi mới ghi, để không bị nửa chừng. */
export async function disableVouchers(
  actorId: string,
  ids: string[],
  reason: DisableReason,
  note: string | undefined,
  now = new Date(),
) {
  if (ids.length > 50) {
    throw new AppError('E-MKT-010-04', 400, 'Chỉ có thể vô hiệu hóa tối đa 50 mã mỗi lần.');
  }
  checkDisableNote(reason, note);
  const docs = await Promise.all(ids.map(load));
  for (const d of docs) {
    const st = voucherStatus(d, now);
    if (st === 'DISABLED' || st === 'EXPIRED') {
      const label = st === 'DISABLED' ? 'Đã vô hiệu hóa' : 'Hết hạn';
      throw new AppError('E-MKT-010-02', 409, `Mã ${d.code} đã ở trạng thái ${label}.`);
    }
  }
  await VoucherModel.updateMany(
    { _id: { $in: docs.map((d) => d._id) } },
    {
      $set: {
        status: 'PAUSED',
        disabledAt: now,
        disableReason: note ? `${reason}: ${note}` : reason,
      },
      $inc: { version: 1 },
    },
  );
  for (const d of docs) {
    logAdminAction(
      actorId,
      'VOUCHER_DISABLE',
      d.code,
      { reason, note },
      reason === 'LEAKED_OR_ABUSED',
    );
  }
  return { disabled: docs.length };
}

export async function enableVoucher(actorId: string, id: string, reason: string, now = new Date()) {
  const v = await load(id);
  if (voucherStatus(v, now) !== 'DISABLED') {
    throw new AppError('E-MKT-010-02', 409, 'Mã không ở trạng thái Đã vô hiệu hóa.');
  }
  const exhausted = v.totalUsageLimit != null && v.usedCount >= v.totalUsageLimit;
  if (now > v.endDate || exhausted) {
    throw new AppError(
      'E-MKT-010-03',
      409,
      'Không thể kích hoạt lại mã đã hết hạn hoặc hết lượt. Vui lòng gia hạn hoặc tăng lượt trước.',
    );
  }
  await VoucherModel.updateOne(
    { _id: id },
    {
      $set: { status: 'ACTIVE' },
      $unset: { disabledAt: 1, disableReason: 1 },
      $inc: { version: 1 },
    },
  );
  logAdminAction(actorId, 'VOUCHER_ENABLE', v.code, { reason });
  return getVoucher(id, now);
}
