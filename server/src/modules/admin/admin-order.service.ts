import { Types } from 'mongoose';
import { OrderModel, type OrderDoc, type OrderStatus } from '../orders/order.model.js';
import { ShipmentModel } from '../orders/shipment.model.js';
import { cancelByAdmin } from '../orders/order.service.js';
import { AppError } from '../../utils/app-error.js';

export interface AdminOrderQuery {
  q?: string;
  status?: OrderStatus[];
  delivery?: 'FLEET' | 'PARTNER';
  from?: Date;
  to?: Date;
  sort: 'createdAt' | '-createdAt' | 'totalAmount' | '-totalAmount';
  page: number;
  limit: number;
}

/** OA-05, API Design 11.4: bước tiếp theo hợp lệ từ mỗi trạng thái. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PENDING_CONFIRMATION', 'CANCELLED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['SHIPPING'],
  SHIPPING: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERY_FAILED: ['SHIPPING', 'RETURNING'],
  RETURNING: ['CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Đơn có dòng cấp 3–4 do đội xe CaraVeso giao, còn lại qua đối tác (requirements 1.2). */
function deliveredBy(order: Pick<OrderDoc, 'items'>): 'FLEET' | 'PARTNER' {
  return order.items.some((item) => (item.shippingTier ?? 0) >= 3) ? 'FLEET' : 'PARTNER';
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toListItem(order: OrderDoc) {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerName: order.shippingAddress.recipientName,
    customerPhone: order.shippingAddress.recipientPhone,
    deliveredBy: deliveredBy(order),
    status: order.status,
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
    totalAmount: order.totalAmount,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: order.createdAt,
  };
}

/** OA-03: danh sách đơn, tìm theo mã đơn, tên hoặc số điện thoại người nhận. */
export async function listOrders(query: AdminOrderQuery) {
  const filter: Record<string, unknown> = {};
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter['$or'] = [
      { orderCode: pattern },
      { 'shippingAddress.recipientName': pattern },
      { 'shippingAddress.recipientPhone': pattern },
    ];
  }
  if (query.status?.length) filter['status'] = { $in: query.status };
  if (query.delivery === 'FLEET') filter['items.shippingTier'] = { $gte: 3 };
  if (query.delivery === 'PARTNER') {
    filter['items'] = { $not: { $elemMatch: { shippingTier: { $gte: 3 } } } };
  }
  if (query.from || query.to) {
    filter['createdAt'] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  const sortField = query.sort.replace('-', '');
  const sort: Record<string, 1 | -1> = { [sortField]: query.sort.startsWith('-') ? -1 : 1, _id: -1 };
  const [orders, total, statusCounts] = await Promise.all([
    OrderModel.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<OrderDoc[]>(),
    OrderModel.countDocuments(filter),
    OrderModel.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  return {
    data: orders.map(toListItem),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
  };
}

/** OA-03: chi tiết đơn cho popup (sản phẩm, thanh toán, giao hàng, lịch sử). */
export async function getOrder(orderId: Types.ObjectId) {
  const order = await OrderModel.findById(orderId).lean<OrderDoc>();
  if (!order) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const shipment = await ShipmentModel.findOne({ orderId }).lean();
  const address = order.shippingAddress;
  return {
    ...toListItem(order),
    address: [address.addressLine, address.ward, address.district, address.province]
      .filter(Boolean)
      .join(', '),
    email: address.email ?? null,
    note: order.note ?? null,
    items: order.items.map((item) => ({
      id: String(item._id),
      name: item.snapshot.name,
      sku: item.snapshot.sku,
      variant: [item.snapshot.color, item.snapshot.material].filter(Boolean).join(' · '),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      finalAmount: item.finalAmount,
      shippingTier: item.shippingTier,
      hasInstallation: item.hasInstallation,
    })),
    amounts: {
      subtotal: order.subtotal,
      promotionDiscount: order.promotionDiscount,
      voucherDiscount: order.voucherDiscount,
      shippingFee: order.shippingFee,
      installationFee: order.installationFee ?? 0,
      total: order.totalAmount,
    },
    payment: {
      method: order.payment.method,
      status: order.payment.status,
      collectionType: order.payment.collectionType,
      depositAmount: order.payment.depositAmount ?? null,
      paidAt: order.payment.paidAt ?? null,
    },
    shipment: shipment
      ? {
          carrier: shipment.carrier ?? null,
          trackingCode: shipment.trackingCode ?? null,
          assignedTeam: shipment.assignedTeam ?? null,
          estimatedDeliveryDate: shipment.estimatedDeliveryDate,
          scheduledDate: shipment.scheduledDate ?? null,
          scheduledSlot: shipment.scheduledSlot ?? null,
        }
      : null,
    cancellation: order.cancellation ?? null,
    statusHistory: order.statusHistory.map((change) => ({
      fromStatus: change.fromStatus ?? null,
      toStatus: change.toStatus,
      note: change.note ?? null,
      changedAt: change.changedAt,
      bySystem: !change.changedBy,
    })),
    allowedNext: NEXT_STATUS[order.status],
  };
}

/** OA-04: `PENDING_CONFIRMATION → CONFIRMED`. Trả `null` nếu đơn không còn ở trạng thái chờ. */
export async function confirmOrder(orderId: Types.ObjectId, adminId: Types.ObjectId, now = new Date()) {
  return OrderModel.findOneAndUpdate(
    { _id: orderId, status: 'PENDING_CONFIRMATION' },
    {
      $set: { status: 'CONFIRMED' },
      $push: {
        statusHistory: {
          changedBy: adminId,
          fromStatus: 'PENDING_CONFIRMATION',
          toStatus: 'CONFIRMED',
          changedAt: now,
        },
      },
    },
    { new: true },
  ).lean<OrderDoc>();
}

export async function cancelOrderByAdmin(
  orderId: Types.ObjectId,
  adminId: Types.ObjectId,
  reason: string,
) {
  const order = await cancelByAdmin(orderId, adminId, reason);
  return toListItem(order);
}
