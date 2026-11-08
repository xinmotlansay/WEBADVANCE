import mongoose, { type ClientSession, type Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import type { LineContext } from '../checkout/line-context.js';
import {
  priceLines,
  type PriceResult,
  type PricingInput,
  type VoucherRule,
} from '../checkout/pricing.js';
import type { PaymentConfig, ShippingConfig } from '../config/config.service.js';
import { OrderModel } from '../orders/order.model.js';
import { UserVoucherModel, type UserVoucherDoc } from './user-voucher.model.js';
import { VoucherUsageModel } from './voucher-usage.model.js';
import { VoucherModel, type VoucherDoc } from './voucher.model.js';
import { checkVoucher, type VoucherLine, type VoucherReason } from './voucher.rules.js';

/** Voucher khách chọn: nhập mã, chọn từ ví, hoặc voucher đã gắn sẵn vào giỏ. */
export interface VoucherRef {
  code?: string;
  userVoucherId?: string;
  voucherId?: Types.ObjectId;
}

/** Kết quả kiểm tra trả cho client (API Design 7.2, 7.3). */
export interface VoucherView {
  /** `null` khi không tìm thấy voucher. */
  voucherId: string | null;
  code: string | null;
  name: string | null;
  valid: boolean;
  reason: VoucherReason | null;
  message: string | null;
  /** Số tiền giảm; 0 khi không hợp lệ. */
  discount: number;
}

export interface VoucherEvaluation {
  view: VoucherView;
  voucher: VoucherDoc | null;
  /** Mục trong ví sẽ được đánh dấu đã dùng khi đặt đơn (voucher thu thập hoặc được tặng). */
  userVoucher: UserVoucherDoc | null;
  rule: VoucherRule | null;
}

/** Một dòng đã chọn: ngữ cảnh sản phẩm và đầu vào tính tiền. */
export interface VoucherRow {
  ctx: LineContext;
  input: PricingInput;
}

const notFound = (message: string): VoucherEvaluation => ({
  view: {
    voucherId: null,
    code: null,
    name: null,
    valid: false,
    reason: 'NOT_FOUND',
    message,
    discount: 0,
  },
  voucher: null,
  userVoucher: null,
  rule: null,
});

async function findVoucher(
  userId: Types.ObjectId,
  ref: VoucherRef,
): Promise<{ voucher: VoucherDoc; picked: UserVoucherDoc | null } | null> {
  if (ref.userVoucherId) {
    const picked = await UserVoucherModel.findOne({ _id: ref.userVoucherId, userId }).lean();
    const voucher = picked && (await VoucherModel.findById(picked.voucherId).lean());
    return voucher && picked ? { voucher, picked } : null;
  }
  const filter = ref.voucherId ? { _id: ref.voucherId } : { code: ref.code?.trim().toUpperCase() };
  const voucher = await VoucherModel.findOne(filter).lean();
  return voucher ? { voucher, picked: null } : null;
}

/** Ngày sinh lưu dạng ngày (UTC nửa đêm); so tháng với tháng hiện tại theo giờ Việt Nam. */
async function isBirthdayMonth(userId: Types.ObjectId, now: Date): Promise<boolean> {
  const user = await mongoose.connection
    .collection('users')
    .findOne({ _id: userId }, { projection: { 'profile.dateOfBirth': 1 } });
  const dob = (user?.['profile'] as { dateOfBirth?: Date } | undefined)?.dateOfBirth;
  if (!dob) return false;
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(dob).getUTCMonth() === vnNow.getUTCMonth();
}

/** Khách mới là khách chưa có đơn nào còn hiệu lực. */
async function isNewCustomer(userId: Types.ObjectId): Promise<boolean> {
  return !(await OrderModel.exists({ userId, status: { $ne: 'CANCELLED' } }));
}

/**
 * Khách đủ điều kiện dùng voucher: đúng nhóm khách, và với voucher thu thập hoặc được tặng thì phải
 * có voucher chưa dùng, còn hạn trong ví. Trả luôn mục ví sẽ bị tiêu khi đặt đơn.
 */
async function customerEligibility(
  userId: Types.ObjectId,
  voucher: VoucherDoc,
  picked: UserVoucherDoc | null,
  now: Date,
): Promise<{ eligible: boolean; userVoucher: UserVoucherDoc | null }> {
  let userVoucher: UserVoucherDoc | null = null;
  if (voucher.type !== 'PUBLIC') {
    userVoucher =
      picked ??
      (await UserVoucherModel.findOne({
        userId,
        voucherId: voucher._id,
        status: 'UNUSED',
      }).lean());
    const usable =
      userVoucher?.status === 'UNUSED' && (!userVoucher.expiresAt || userVoucher.expiresAt > now);
    if (!usable) return { eligible: false, userVoucher: null };
  }

  const group =
    voucher.customerGroup === 'NEW_CUSTOMER'
      ? await isNewCustomer(userId)
      : voucher.customerGroup === 'BIRTHDAY_MONTH'
        ? await isBirthdayMonth(userId, now)
        : true;
  return { eligible: group, userVoucher };
}

const toVoucherLine = ({ ctx, input }: VoucherRow, finalAmount: number): VoucherLine => ({
  variantId: input.variantId,
  productId: ctx.product._id.toString(),
  categoryIds: (ctx.product.categoryIds ?? []).map((id) => id.toString()),
  finalAmount,
  hasPromotion: input.unitPromotionDiscount > 0,
});

/**
 * Kiểm tra `ref` với các dòng đã chọn. `base` là kết quả tính tiền chưa có voucher (cho tiền hàng sau
 * khuyến mãi của từng dòng).
 */
export async function evaluateVoucher(
  userId: Types.ObjectId,
  ref: VoucherRef,
  rows: VoucherRow[],
  base: PriceResult,
  now = new Date(),
): Promise<VoucherEvaluation> {
  const found = await findVoucher(userId, ref);
  if (!found) return notFound('Mã giảm giá không tồn tại');
  const { voucher, picked } = found;

  const [usedCount, customer] = await Promise.all([
    VoucherUsageModel.countDocuments({ voucherId: voucher._id, userId, status: 'USED' }),
    customerEligibility(userId, voucher, picked, now),
  ]);
  const check = checkVoucher(voucher, {
    now,
    lines: rows.map((row, i) => toVoucherLine(row, base.items[i]!.finalAmount)),
    userUsedCount: usedCount,
    customerEligible: customer.eligible,
  });

  const view: VoucherView = {
    voucherId: voucher._id.toString(),
    code: voucher.code,
    name: voucher.name ?? null,
    valid: check.valid,
    reason: check.valid ? null : check.reason,
    message: check.valid ? null : check.message,
    discount: check.valid ? check.discount : 0,
  };
  return {
    view,
    voucher,
    userVoucher: customer.userVoucher,
    rule: check.valid ? check.rule : null,
  };
}

/**
 * Tính tiền các dòng đã chọn kèm voucher: tính lần một không voucher để biết tiền hàng sau khuyến
 * mãi, kiểm tra voucher rồi tính lần hai nếu hợp lệ. Không có `ref` thì chỉ tính lần một.
 */
export async function priceWithVoucher(args: {
  userId: Types.ObjectId;
  ref: VoucherRef | null;
  rows: VoucherRow[];
  shipping: ShippingConfig;
  payment: PaymentConfig;
  now?: Date;
}): Promise<{ priced: PriceResult; evaluation: VoucherEvaluation | null }> {
  const { userId, ref, rows, shipping, payment, now } = args;
  const inputs = rows.map((r) => r.input);
  const base = priceLines(inputs, shipping, payment);
  if (!ref) return { priced: base, evaluation: null };

  const evaluation = await evaluateVoucher(userId, ref, rows, base, now);
  const priced = evaluation.rule ? priceLines(inputs, shipping, payment, evaluation.rule) : base;
  return { priced, evaluation };
}

/**
 * Tiêu một lượt voucher cho đơn mới, trong transaction của đơn: tăng `usedCount` nếu còn lượt, ghi
 * lượt dùng, đánh dấu voucher trong ví đã dùng. Hết lượt do người khác vừa dùng thì ném `VOUCHER_INVALID`.
 */
export async function consumeVoucher(
  session: ClientSession,
  evaluation: VoucherEvaluation,
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
  now: Date,
): Promise<void> {
  const voucher = evaluation.voucher;
  if (!voucher) return;
  const exhausted = (reason: VoucherReason, message: string) =>
    new AppError('VOUCHER_INVALID', 409, message, { reason });

  const claimed = await VoucherModel.findOneAndUpdate(
    {
      _id: voucher._id,
      status: 'ACTIVE',
      $or: [
        { totalUsageLimit: null },
        { totalUsageLimit: { $exists: false } },
        { $expr: { $lt: ['$usedCount', '$totalUsageLimit'] } },
      ],
    },
    { $inc: { usedCount: 1 } },
    { session },
  );
  if (!claimed) throw exhausted('USAGE_LIMIT_REACHED', 'Mã giảm giá đã hết lượt sử dụng');

  await VoucherUsageModel.create([{ voucherId: voucher._id, userId, orderId, usedAt: now }], {
    session,
  });
  // Hai đơn của cùng khách đặt song song: đếm lại sau khi ghi để không vượt giới hạn mỗi người.
  const used = await VoucherUsageModel.countDocuments(
    { voucherId: voucher._id, userId, status: 'USED' },
    { session },
  );
  if (used > voucher.perUserLimit) {
    throw exhausted('PER_USER_LIMIT_REACHED', 'Bạn đã dùng hết lượt của mã giảm giá này');
  }

  if (evaluation.userVoucher) {
    const marked = await UserVoucherModel.updateOne(
      { _id: evaluation.userVoucher._id, status: 'UNUSED' },
      { $set: { status: 'USED', usedOrderId: orderId } },
      { session },
    );
    if (marked.modifiedCount === 0) {
      throw exhausted('CUSTOMER_GROUP_NOT_ELIGIBLE', 'Voucher trong ví đã được dùng');
    }
  }
}

/**
 * Hoàn lượt dùng khi đơn bị hủy hoặc hết hạn thanh toán (BR: hoàn lượt, trả voucher về ví). Trả hàng
 * sau khi giao thì không gọi hàm này. Gọi lại nhiều lần vẫn an toàn.
 */
export async function refundVoucherUsage(
  session: ClientSession,
  orderId: Types.ObjectId,
  now: Date,
): Promise<void> {
  const usage = await VoucherUsageModel.findOneAndUpdate(
    { orderId, status: 'USED' },
    { $set: { status: 'USAGE_REFUNDED', usageRefundedAt: now } },
    { session },
  );
  if (!usage) return;
  await VoucherModel.updateOne({ _id: usage.voucherId }, { $inc: { usedCount: -1 } }, { session });
  await UserVoucherModel.updateOne(
    { usedOrderId: orderId, status: 'USED' },
    { $set: { status: 'UNUSED' }, $unset: { usedOrderId: 1 } },
    { session },
  );
}
