import type { Types } from 'mongoose';
import { WarrantyCardModel } from '../after-sales/after-sales.model.js';

interface DeliveredOrder {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: {
    _id: Types.ObjectId;
    quantity: number;
    warrantyMonths?: number;
    snapshot: { name?: string | null; sku?: string | null };
  }[];
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Cấp phiếu bảo hành cho từng dòng hàng khi đơn được giao thành công. Bảo hành tính từ ngày giao.
 * Idempotent theo (orderId, orderItemId); dòng không có thời hạn bảo hành thì bỏ qua.
 * Dùng chung hai nhóm trường mà phía khách (activatedAt, status) và phía Order Admin (startsAt, userId) cùng đọc.
 */
export async function issueWarrantyCards(order: DeliveredOrder, deliveredAt = new Date()): Promise<number> {
  let issued = 0;
  for (const item of order.items) {
    const months = item.warrantyMonths ?? 0;
    if (months <= 0) continue;
    const result = await WarrantyCardModel.updateOne(
      { orderId: order._id, orderItemId: item._id },
      {
        $setOnInsert: {
          orderId: order._id,
          orderItemId: item._id,
          userId: order.userId,
          productName: item.snapshot.name ?? null,
          sku: item.snapshot.sku ?? null,
          serialNumber: '',
          quantity: item.quantity,
          warrantyMonths: months,
          activatedAt: deliveredAt,
          startsAt: deliveredAt,
          expiresAt: addMonths(deliveredAt, months),
          status: 'VALID',
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) issued++;
  }
  return issued;
}
