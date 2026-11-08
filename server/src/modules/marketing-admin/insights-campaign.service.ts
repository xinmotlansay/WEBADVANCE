import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { UserStatus } from '../../lib/shared-enums.js';
import { AppError } from '../../utils/app-error.js';
import { UserModel } from '../auth/auth.model.js';
import { OrderModel } from '../orders/order.model.js';
import { UserVoucherModel } from '../vouchers/user-voucher.model.js';
import { VoucherModel } from '../vouchers/voucher.model.js';
import { logAdminAction } from './admin-log.js';
import { CustomerScoreModel, ensureScoreSchema } from './customer-score.model.js';
import {
  compareReturn,
  eligibleForVoucher,
  expectedCost,
  expectedNet,
  inCooldown,
  measuredSaveRate,
  S_REF,
  voucherCurve,
} from './insights.rules.js';
import { insertVoucher } from './voucher-admin.service.js';

const DAY = 86_400_000;
/** Đơn chưa thành giao dịch không tính là khách quay lại. */
export const NOT_A_PURCHASE = ['CANCELLED', 'PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'DELIVERY_FAILED'] as const;
/** Dưới ngưỡng này kết luận so sánh không đáng tin (báo cáo ghi rõ cỡ mẫu). */
export const MIN_SAMPLE = 30;

/**
 * Quy tắc phát voucher: ô "Giữ ngay" và net > 0 tại mức giảm áp dụng (tasks/voucher-rule-plan.md).
 * Phát cho cả ô lỗ ở mọi tỷ lệ cứu 5–30% vì hơn nửa ô có net ≤ 0.
 */
export const segmentVoucherSchema = z.object({
  discountPercent: z.number().int().min(1).max(90),
  maxDiscountValue: z.number().int().min(1000).multipleOf(1000),
  minOrderValue: z.number().int().min(0).default(0),
  validDays: z.number().int().min(7).max(60).default(14),
  /** Tỷ lệ cứu dùng để lọc người nhận; bỏ trống = giả định 30%. Thường là ŝ đo được. */
  saveRate: z.number().gt(0).max(1).optional(),
});
export type SegmentVoucherInput = z.infer<typeof segmentVoucherSchema>;

export const voucherPreviewSchema = z.object({
  discountPercent: z.coerce.number().int().min(1).max(90),
  saveRate: z.coerce.number().gt(0).max(1).optional(),
});

const newCode = () => `RT${randomBytes(4).toString('hex').toUpperCase()}`;

/**
 * Người nhận và nhóm đối chứng ở mức giảm `discountPct`: khách ô RETAIN có net > 0 tại mức đó, tài khoản còn hoạt động.
 * Hai nhóm qua cùng tiêu chí để so sánh tỷ lệ quay lại công bằng. Xem trước và tạo voucher cùng gọi hàm này.
 * Loại khách còn giữ voucher ML trước chưa hết hạn (cooldown, `inCooldown`) ở cả hai nhóm; `cooledDown` là số bị loại.
 */
async function voucherAudience(discountPct: number, s = S_REF, now = new Date()) {
  await ensureScoreSchema();
  const scores = await CustomerScoreModel.find(
    { segment: 'RETAIN' },
    'customerId isControl segment pChurn clv voucherCost',
  ).lean();
  const activeIds = new Set(
    (
      await UserModel.find(
        { _id: { $in: scores.map((s) => s.customerId) }, status: UserStatus.ACTIVE },
        '_id',
      ).lean()
    ).map((u) => String(u._id)),
  );
  const active = scores.filter((s) => activeIds.has(String(s.customerId)));
  const mlVoucherIds = await VoucherModel.distinct('_id', { mlSegment: { $exists: true } });
  const held = await UserVoucherModel.find(
    { voucherId: { $in: mlVoucherIds }, userId: { $in: active.map((s) => s.customerId) } },
    'userId expiresAt',
  ).lean();
  const cooled = new Set(held.filter((uv) => inCooldown(uv.expiresAt, now)).map((uv) => String(uv.userId)));
  const eligible = active.filter((r) => eligibleForVoucher(r, discountPct, s));
  const live = eligible.filter((s) => !cooled.has(String(s.customerId)));
  const treated = live.filter((s) => !s.isControl);
  return {
    recipients: treated.map((s) => s.customerId),
    treated,
    controlIds: live.filter((s) => s.isControl).map((s) => s.customerId),
    cooledDown: eligible.length - live.length,
    /** Khách nhận được ở mức giảm bất kỳ (đã trừ đối chứng, cooldown), cho đường cong. */
    candidates: active.filter((s) => !s.isControl && !cooled.has(String(s.customerId))),
  };
}

/**
 * Số người sẽ nhận và số đối chứng ở một mức giảm, chưa tạo gì. Chỉ trả số lượng và tổng:
 * Σnet, Σ chi phí kỳ vọng của nhóm nhận, và đường cong 5–30% (số người nhận, Σnet).
 */
export async function previewSegmentVoucher(discountPct: number, s = S_REF) {
  const { treated, controlIds, cooledDown, candidates } = await voucherAudience(discountPct, s);
  const sum = (f: (r: (typeof treated)[number]) => number | null) => treated.reduce((a, r) => a + (f(r) ?? 0), 0);
  return {
    discountPercent: discountPct,
    saveRate: s,
    recipients: treated.length,
    controls: controlIds.length,
    cooledDown,
    expectedNet: sum((r) => expectedNet(r, discountPct, s)),
    expectedCost: sum((r) => expectedCost(r, discountPct, s)),
    curve: voucherCurve(candidates, s),
  };
}

/**
 * Tạo voucher ASSIGNED và gán vào ví khách ô RETAIN có net > 0 ở mức giảm đã chọn, trừ nhóm đối chứng.
 * Marketing Admin không thấy danh tính: chỉ nhận số lượng.
 */
export async function createSegmentVoucher(actorId: string, input: SegmentVoucherInput, now = new Date()) {
  const { recipients, controlIds, cooledDown } = await voucherAudience(input.discountPercent, input.saveRate ?? S_REF, now);
  const active = recipients.map((_id) => ({ _id }));
  if (!active.length) {
    throw new AppError(
      'NO_RECIPIENTS',
      409,
      cooledDown
        ? `Không còn khách để gửi: ${cooledDown.toLocaleString('vi-VN')} khách còn giữ voucher của chiến dịch trước (chờ hết hạn rồi gửi lại).`
        : 'Không có khách nào trong ô Giữ ngay có lãi ở mức giảm này. Hãy giảm mức giảm hoặc chấm điểm lại.',
    );
  }

  let voucher;
  for (let attempt = 0; ; attempt += 1) {
    try {
      voucher = await insertVoucher(
        actorId,
        {
          code: newCode(),
          name: `Giữ khách ${now.toLocaleDateString('vi-VN')}`,
          description: `Ưu đãi ${input.discountPercent}% dành riêng cho bạn, dùng trong ${input.validDays} ngày.`,
          discountType: 'PERCENT',
          discountValue: input.discountPercent,
          maxDiscountValue: input.maxDiscountValue,
          minOrderValue: input.minOrderValue,
          totalUsageLimit: active.length,
          perUserLimit: 1,
          startNow: true,
          endDate: new Date(now.getTime() + input.validDays * DAY),
          customerGroup: 'ACCOUNT',
          visibility: 'PRIVATE',
          stackableWithPromotion: false,
        },
        now,
        { type: 'ASSIGNED', mlSegment: 'RETAIN', mlControlIds: controlIds },
      );
      break;
    } catch (e) {
      // Mã ngẫu nhiên trùng (hiếm): thử lại; lỗi khác báo ngay.
      if (attempt >= 2 || (e as AppError).code !== 'E-MKT-008-02') throw e;
    }
  }

  await UserVoucherModel.insertMany(
    active.map((u) => ({
      userId: u._id,
      voucherId: voucher._id,
      source: 'GIFTED' as const,
      receivedAt: now,
      expiresAt: voucher.endDate,
      status: 'UNUSED' as const,
    })),
    { ordered: false },
  );
  logAdminAction(actorId, 'INSIGHTS_SEGMENT_VOUCHER', voucher.code, {
    segment: 'RETAIN',
    rule: 'net>0',
    discountPercent: input.discountPercent,
    saveRate: input.saveRate ?? S_REF,
    recipients: active.length,
    controls: controlIds.length,
  });
  return { code: voucher.code, recipients: active.length, endDate: voucher.endDate };
}

// Chỉ đếm đơn trong hạn voucher: khách nhận lại ở chiến dịch sau thì đơn sau đó không tính lặp cho chiến dịch trước.
async function returned(userIds: Types.ObjectId[], since: Date, until: Date): Promise<number> {
  if (!userIds.length) return 0;
  const ids = await OrderModel.distinct('userId', {
    userId: { $in: userIds },
    createdAt: { $gte: since, $lte: until },
    status: { $nin: NOT_A_PURCHASE },
  });
  return ids.length;
}

/**
 * Hiệu quả từng chiến dịch: tỷ lệ quay lại (có đơn thật sau ngày gửi) của nhóm nhận so với nhóm đối chứng cùng ô.
 * `saveRate`: ŝ gộp (cộng dồn n và số quay lại) của các chiến dịch có nhóm đối chứng riêng (`mlControlIds`).
 */
export async function campaignReport(now = new Date()) {
  const vouchers = await VoucherModel.find({ mlSegment: { $exists: true } }).sort({ createdAt: -1 }).limit(20).lean();
  // ponytail: chiến dịch cũ (trước khi lưu mlControlIds) rơi về nhóm đối chứng hiện tại, có thể lệch sau khi chấm lại.
  const currentControl = (
    await CustomerScoreModel.find({ segment: 'RETAIN', isControl: true }, 'customerId').lean()
  ).map((s) => s.customerId);
  const rows = [];
  for (const v of vouchers) {
    const since = v.startDate;
    const recipients = (await UserVoucherModel.find({ voucherId: v._id }, 'userId').lean()).map((u) => u.userId);
    const treated = { n: recipients.length, returned: await returned(recipients, since, v.endDate) };
    const control = v.mlControlIds ?? currentControl;
    const ctrl = { n: control.length, returned: await returned(control, since, v.endDate) };
    rows.push({
      id: String(v._id),
      code: v.code,
      segment: v.mlSegment,
      discountPercent: v.discountValue,
      sentAt: since,
      endDate: v.endDate,
      seen: await UserVoucherModel.countDocuments({ voucherId: v._id, seenAt: { $ne: null } }),
      used: v.usedCount,
      treated,
      control: ctrl,
      ...compareReturn(treated, ctrl),
      enoughSample: Math.min(treated.n, ctrl.n) >= MIN_SAMPLE,
      running: v.endDate > now,
      ownControl: !!v.mlControlIds,
    });
  }
  const own = rows.filter((r) => r.ownControl);
  const add = (k: 'treated' | 'control') =>
    own.reduce((a, r) => ({ n: a.n + r[k].n, returned: a.returned + r[k].returned }), { n: 0, returned: 0 });
  const treated = add('treated');
  const control = add('control');
  // ponytail: "mô phỏng" = có ít nhất một đơn SIM-<mã> của script simulate-campaign-response, không tách tỷ lệ thật/mô phỏng.
  const ownCodes = own.map((r) => r.code); // mã RT + hex, an toàn trong regex
  const simulated =
    ownCodes.length > 0 && !!(await OrderModel.exists({ orderCode: { $regex: `^SIM-(${ownCodes.join('|')})-` } }));
  return {
    campaigns: rows,
    saveRate: {
      assumed: S_REF,
      campaigns: own.length,
      treated,
      control,
      measured: measuredSaveRate(treated, control),
      enoughSample: Math.min(treated.n, control.n) >= MIN_SAMPLE,
      simulated,
    },
  };
}
