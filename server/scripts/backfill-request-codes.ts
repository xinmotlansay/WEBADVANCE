import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { ReturnRequestModel, WarrantyCardModel, WarrantyRequestModel } from '../src/modules/after-sales/after-sales.model.js';
import { nextRequestCode } from '../src/modules/after-sales/request-code.js';

/** Gán mã (BH-/RT-) và orderId/orderItemId cho yêu cầu của khách tạo trước khi có mã. `--apply` để ghi. */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongodbUri);
  const warranty = await WarrantyRequestModel.find({ $or: [{ code: { $exists: false } }, { code: null }] });
  for (const r of warranty) {
    const card = await WarrantyCardModel.findById(r.warrantyCardId).lean();
    console.log(`warranty ${r._id}: thiếu mã`);
    if (!apply) continue;
    r.code = await nextRequestCode('BH', WarrantyRequestModel as never, r.requestedAt ?? new Date());
    if (card) {
      r.orderId = card.orderId;
      r.orderItemId = card.orderItemId;
    }
    await r.save();
  }
  const returns = await ReturnRequestModel.find({ $or: [{ code: { $exists: false } }, { code: null }] });
  for (const r of returns) {
    console.log(`return ${r._id}: thiếu mã`);
    if (!apply) continue;
    r.code = await nextRequestCode('RT', ReturnRequestModel as never, r.requestedAt ?? new Date());
    await r.save();
  }
  console.log(apply ? 'Đã cập nhật.' : 'Chạy thêm --apply để ghi.');
  await mongoose.disconnect();
}
void main();
