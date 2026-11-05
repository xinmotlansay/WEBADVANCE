// Mô phỏng phản hồi một chiến dịch voucher ML (chỉ dùng cho demo, KHÔNG chạy trên DB thật).
// Dùng: npm run ml:simulate -- --code RTxxxx --treated 0.35 --control 0.25 [--used 0.5] [--force]
// Tạo đơn DELIVERED (mã SIM-…) sau ngày gửi cho đủ tỷ lệ khách mỗi nhóm; chạy lại không tạo đơn trùng.
import { parseArgs } from 'node:util';
import mongoose, { type Types } from 'mongoose';
import { config } from '../src/config/index.js';
import { CustomerScoreModel } from '../src/modules/marketing-admin/customer-score.model.js';
import { NOT_A_PURCHASE } from '../src/modules/marketing-admin/insights-campaign.service.js';
import { pickSimulatedReturners } from '../src/modules/marketing-admin/insights.rules.js';
import { OrderModel } from '../src/modules/orders/order.model.js';
import { UserVoucherModel } from '../src/modules/vouchers/user-voucher.model.js';
import { VoucherModel } from '../src/modules/vouchers/voucher.model.js';

const { values: args } = parseArgs({
  options: {
    code: { type: 'string' },
    treated: { type: 'string' },
    control: { type: 'string' },
    used: { type: 'string', default: '0.5' },
    force: { type: 'boolean', default: false },
  },
});

function rate(name: 'treated' | 'control' | 'used'): number {
  const r = Number(args[name]);
  if (!(r >= 0 && r <= 1)) fail(`--${name} phải là số trong [0, 1].`);
  return r;
}

function fail(msg: string): never {
  console.warn(msg);
  process.exit(1);
}

const ORDER_VALUE = 5_000_000;
const DAY = 86_400_000;

async function simulateGroup(
  label: string,
  userIds: Types.ObjectId[],
  target: number,
  voucher: { _id: Types.ObjectId; code: string; startDate: Date; discountValue: number; maxDiscountValue?: number | null },
  usedRate: number,
): Promise<void> {
  const since = voucher.startDate;
  const done = await OrderModel.distinct('userId', {
    userId: { $in: userIds },
    createdAt: { $gte: since },
    status: { $nin: NOT_A_PURCHASE },
  });
  const picked = pickSimulatedReturners(
    userIds.map(String),
    new Set(done.map(String)),
    target,
  );
  // Rải ngày đặt trong tối đa 7 ngày sau ngày gửi, không vượt quá hiện tại.
  const span = Math.max(0, Math.min(7 * DAY, Date.now() - since.getTime()));
  const useVoucher = label === 'nhận' ? Math.round(picked.length * usedRate) : 0;
  for (const [i, uid] of picked.entries()) {
    const withVoucher = i < useVoucher;
    const discount = withVoucher
      ? Math.min((ORDER_VALUE * voucher.discountValue) / 100, voucher.maxDiscountValue ?? Infinity)
      : 0;
    const at = new Date(since.getTime() + (span * (i + 1)) / (picked.length + 1));
    const order = await OrderModel.create({
      orderCode: `SIM-${voucher.code}-${uid.slice(-8)}`,
      userId: uid,
      // Khóa (userId, idempotencyKey) unique: chạy song song cũng không trùng đơn.
      idempotencyKey: `SIM-${voucher._id}`,
      voucherId: withVoucher ? voucher._id : null,
      shippingAddress: {
        recipientName: 'Khách mô phỏng',
        recipientPhone: '0000000000',
        addressLine: 'Đơn mô phỏng',
        ward: 'Mô phỏng',
        province: 'Mô phỏng',
      },
      subtotal: ORDER_VALUE,
      voucherDiscount: discount,
      shippingFee: 0,
      totalAmount: ORDER_VALUE - discount,
      status: 'DELIVERED',
      note: 'simulated: true',
      items: [],
      statusHistory: [{ changedBy: null, toStatus: 'DELIVERED', note: 'simulated', changedAt: at }],
      payment: { method: 'COD', status: 'PAID', paidAt: at },
      source: 'CART',
      createdAt: at,
      updatedAt: at,
    });
    if (withVoucher) {
      await UserVoucherModel.updateOne(
        { userId: uid, voucherId: voucher._id },
        { status: 'USED', usedOrderId: order._id },
      );
    }
  }
  if (useVoucher) await VoucherModel.updateOne({ _id: voucher._id }, { $inc: { usedCount: useVoucher } });
  const total = done.length + picked.length;
  console.warn(
    `Nhóm ${label}: ${total}/${userIds.length} quay lại (thêm ${picked.length} đơn` +
      (useVoucher ? `, ${useVoucher} dùng mã` : '') +
      ')',
  );
}

async function main(): Promise<void> {
  if (!args.code) fail('Thiếu --code (mã voucher của chiến dịch).');
  const treated = rate('treated');
  const control = rate('control');
  const used = rate('used');
  if (!/:27018(\/|\?|$)/.test(config.mongodbUri) && !args.force) {
    fail('MONGODB_URI không phải cổng 27018 (DB demo). Thêm --force nếu chắc chắn muốn ghi đơn giả vào DB này.');
  }
  await mongoose.connect(config.mongodbUri);
  const voucher = await VoucherModel.findOne({ code: args.code.toUpperCase(), mlSegment: { $exists: true } }).lean();
  if (!voucher) fail(`Không có chiến dịch ML với mã ${args.code}.`);
  const recipients = (await UserVoucherModel.find({ voucherId: voucher._id }, 'userId').lean()).map((u) => u.userId);
  // Cùng cách chọn nhóm đối chứng với campaignReport.
  const controls =
    voucher.mlControlIds ??
    (await CustomerScoreModel.find({ segment: 'RETAIN', isControl: true }, 'customerId').lean()).map(
      (s) => s.customerId,
    );
  await simulateGroup('nhận', recipients, treated, voucher, used);
  await simulateGroup('đối chứng', controls, control, voucher, used);
}

main()
  .catch((err: unknown) => {
    console.warn('Mô phỏng thất bại:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
