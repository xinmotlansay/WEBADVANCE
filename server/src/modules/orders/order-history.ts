import type { Types } from 'mongoose';
import { SystemConfigModel } from '../config/system-config.model.js';
import { ProductModel } from '../products/product.model.js';
import { pickThumbnail } from '../products/product.service.js';
import { VariantModel } from '../products/variant.model.js';
import { ReviewModel } from '../reviews/review.model.js';
import { OrderModel, type OrderDoc, type OrderStatus } from './order.model.js';
import { ShipmentModel } from './shipment.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REVIEW_DAYS = 90;
const DEFAULT_RETURN_DAYS = 7;

/** Số ngày đánh giá / đổi trả lấy từ `system_configs`, thiếu thì dùng mặc định trong docs. */
async function policyDays(): Promise<{ review: number; return: number }> {
  const rows = await SystemConfigModel.find({
    _id: { $in: ['policy.reviewDays', 'policy.returnDays'] },
  }).lean();
  const value = (key: string, fallback: number): number => {
    const found = rows.find((row) => row._id === key)?.value;
    return typeof found === 'number' && found >= 0 ? found : fallback;
  };
  return {
    review: value('policy.reviewDays', DEFAULT_REVIEW_DAYS),
    return: value('policy.returnDays', DEFAULT_RETURN_DAYS),
  };
}

/** Ngày giao thực tế: `shipment.actualDeliveryDate`, thiếu thì lấy lần chuyển sang `DELIVERED`. */
function deliveredAt(order: OrderDoc, actual?: Date | null): Date | null {
  if (actual) return actual;
  const entry = [...order.statusHistory].reverse().find((change) => change.toStatus === 'DELIVERED');
  return entry?.changedAt ?? null;
}

export interface ItemActions {
  canReview: boolean;
  reviewDeadline: string | null;
  canReturn: boolean;
  returnDeadline: string | null;
  canRequestWarranty: boolean;
  reviewId: string | null;
}

/** API Design 3.1: các cờ `actions.*` do backend tính cho từng dòng hàng của đơn. */
export async function getItemActions(
  order: OrderDoc,
  now = new Date(),
): Promise<Map<string, ItemActions>> {
  const result = new Map<string, ItemActions>();
  const [shipment, days, reviews] = await Promise.all([
    ShipmentModel.findOne({ orderId: order._id }).lean(),
    policyDays(),
    ReviewModel.find({ orderId: order._id }, { orderItemId: 1, status: 1 }).lean(),
  ]);
  const delivered = order.status === 'DELIVERED' ? deliveredAt(order, shipment?.actualDeliveryDate) : null;
  const reviewByItem = new Map(reviews.map((review) => [review.orderItemId.toString(), review]));

  for (const item of order.items) {
    const review = reviewByItem.get(item._id.toString());
    const reviewDeadline = delivered ? new Date(delivered.getTime() + days.review * DAY_MS) : null;
    const returnDeadline = delivered ? new Date(delivered.getTime() + days.return * DAY_MS) : null;
    const warrantyEnd = delivered
      ? new Date(new Date(delivered).setMonth(delivered.getMonth() + item.warrantyMonths))
      : null;
    result.set(item._id.toString(), {
      // Dòng đã có đánh giá (kể cả đã xóa) thì không đánh giá lại.
      canReview: !!reviewDeadline && now <= reviewDeadline && !review,
      reviewDeadline: reviewDeadline?.toISOString() ?? null,
      canReturn: !!returnDeadline && now <= returnDeadline,
      returnDeadline: returnDeadline?.toISOString() ?? null,
      canRequestWarranty: !!warrantyEnd && now <= warrantyEnd,
      reviewId: review && review.status !== 'DELETED' ? review._id.toString() : null,
    });
  }
  return result;
}

/** FR-10, API Design 3.0: lịch sử đơn của khách, mới nhất trước. */
export async function listOrders(
  userId: Types.ObjectId,
  query: { status?: OrderStatus[]; page: number; limit: number },
) {
  const filter = { userId, ...(query.status?.length ? { status: { $in: query.status } } : {}) };
  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  const previewVariantIds = orders.flatMap((order) => order.items.slice(0, 3).map((i) => i.variantId));
  const [variants, shipments] = await Promise.all([
    VariantModel.find({ _id: { $in: previewVariantIds } }, { productId: 1 }).lean(),
    ShipmentModel.find({ orderId: { $in: orders.map((o) => o._id) } }).lean(),
  ]);
  const products = await ProductModel.find({ _id: { $in: variants.map((v) => v.productId) } }).lean();
  const thumbnailByProduct = new Map(products.map((p) => [p._id.toString(), pickThumbnail(p)]));
  const thumbnailByVariant = new Map(
    variants.map((v) => [v._id.toString(), thumbnailByProduct.get(v.productId.toString()) ?? '']),
  );
  const shipmentByOrder = new Map(shipments.map((s) => [s.orderId.toString(), s]));

  return {
    total,
    items: orders.map((order) => ({
      id: order._id.toString(),
      orderCode: order.orderCode,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      totalAmount: order.totalAmount,
      paymentStatus: order.payment.status,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      previewItems: order.items.slice(0, 3).map((item) => ({
        name: item.snapshot.name,
        thumbnail: thumbnailByVariant.get(item.variantId.toString()) ?? '',
        quantity: item.quantity,
      })),
      estimatedDeliveryDate:
        shipmentByOrder.get(order._id.toString())?.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    })),
  };
}
