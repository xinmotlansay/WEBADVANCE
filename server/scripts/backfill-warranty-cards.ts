import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { OrderModel } from '../src/modules/orders/order.model.js';
import { WarrantyCardModel } from '../src/modules/after-sales/after-sales.model.js';
import { issueWarrantyCards } from '../src/modules/warranty/warranty-issue.js';

/** Cấp phiếu bảo hành cho các đơn đã giao nhưng chưa có phiếu. `--apply` để ghi, mặc định chỉ liệt kê. */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongodbUri);
  const orders = await OrderModel.find({ status: 'DELIVERED' }).lean();
  let total = 0;
  for (const order of orders) {
    const have = new Set(
      (await WarrantyCardModel.find({ orderId: order._id }).select('orderItemId').lean()).map((c) => String(c.orderItemId)),
    );
    const missing = order.items.filter((i) => (i.warrantyMonths ?? 0) > 0 && !have.has(String(i._id)));
    if (!missing.length) continue;
    const deliveredAt =
      [...order.statusHistory].reverse().find((h) => h.toStatus === 'DELIVERED')?.changedAt ?? order.createdAt;
    console.log(`${order.orderCode}: thiếu ${missing.length} phiếu (giao ${deliveredAt.toISOString()})`);
    if (apply) total += await issueWarrantyCards({ ...order, items: missing } as never, deliveredAt);
  }
  console.log(apply ? `Đã cấp ${total} phiếu.` : 'Chạy thêm --apply để ghi.');
  await mongoose.disconnect();
}
void main();
