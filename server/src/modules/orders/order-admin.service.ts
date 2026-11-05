import type { QueryFilter, Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import {
  CancellationActor,
  LateCompensationStatus,
  OrderPaymentStatus,
  RefundSource,
  RefundStatus,
  OrderStatus,
  PaymentMethod,
  ShipmentStatus,
} from '../../lib/shared-enums.js';
import type {
  LateCompensationRequest,
  OrderDetail,
  OrderListItem,
  OrderPaymentSummary,
} from '../../lib/shared-types.js';
import { UserModel, type IUser } from '../auth/auth.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import {
  InvoiceModel,
  OrderModel,
  toSharedOrderStatus,
  type OrderDocument,
} from './order.model.js';
import { issueWarrantyCards } from '../warranty/warranty-issue.js';
import { paidAmountOf } from '../payments/payment.rules.js';
import { findOrderRefunds, requestRefund } from '../payments/refund.service.js';
import { ShipmentModel } from './shipment.model.js';
import {
  LateCompensationRequestModel,
  type LateCompensationRequestDoc,
} from './late-compensation.model.js';
import {
  assertCancellable,
  assertRedeliveryAllowed,
  assertTransition,
  canCancel,
  computeRefundAmount,
} from './order.rules.js';
import { toOrderDetail, toOrderListItem, type OrderCustomerView } from './order.mapper.js';
import type {
  CancelOrderInput,
  DeliveryFailedInput,
  FinalizeReturnInput,
  OrderListQueryInput,
  UpdateOrderStatusInput,
  UpdateShipmentInput,
} from './order-admin.schema.js';

export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ActorContext {
  userId: string;
  ip?: string | null;
}

/* ----------------------------- Helpers ----------------------------- */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateBoundary(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function toCustomerView(
  user: Pick<IUser, 'profile' | 'email' | 'phoneNumber'> & { _id: unknown },
): OrderCustomerView {
  return {
    _id: user._id,
    profile: user.profile,
    email: user.email ?? null,
    phoneNumber: user.phoneNumber ?? null,
  };
}

async function requireOrder(id: string): Promise<OrderDocument> {
  const order = await OrderModel.findById(id);
  if (!order) {
    throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  }
  return order;
}

async function requireCustomer(userId: unknown): Promise<OrderCustomerView> {
  const user = await UserModel.findById(userId).select('profile email phoneNumber');
  if (!user) {
    throw new AppError('CUSTOMER_NOT_FOUND', 404, 'Không tìm thấy khách hàng của đơn');
  }
  return toCustomerView(user);
}

async function loadDetail(order: OrderDocument): Promise<OrderDetail> {
  const [customer, shipment, invoice, refunds] = await Promise.all([
    requireCustomer(order.userId),
    ShipmentModel.findOne({ orderId: order._id }),
    InvoiceModel.findOne({ orderId: order._id }).select('invoiceNumber'),
    findOrderRefunds([order._id]),
  ]);
  const refund = refunds.get(String(order._id));
  return toOrderDetail(order, customer, shipment, {
    invoiceNumber: invoice?.invoiceNumber ?? null,
    refund: refund
      ? {
          transactionId: String(refund._id),
          amount: refund.amount,
          status: refund.status,
          source: refund.refundSource ?? null,
          refundTo: refund.refundTo ?? null,
          originalTransactionCode: refund.originalTransactionCode ?? null,
          refundAccount: refund.refundAccount
            ? {
                bankName: refund.refundAccount.bankName,
                accountNumber: refund.refundAccount.accountNumber,
                accountHolder: refund.refundAccount.accountHolder,
              }
            : null,
          requestedAt: refund.createdAt.toISOString(),
          completedAt:
            refund.status === RefundStatus.COMPLETED ? refund.transactionAt.toISOString() : null,
          proofImage: refund.proofImage ?? null,
        }
      : null,
  });
}

function appendHistory(
  order: OrderDocument,
  toStatus: OrderStatus,
  actorId: string | null,
  note?: string,
): void {
  const fromStatus = order.status;
  order.statusHistory.push({
    fromStatus,
    toStatus,
    note: note ?? null,
    changedAt: new Date(),
    changedBy: actorId ? (actorId as unknown as OrderDocument['userId']) : null,
  });
  order.status = toStatus;
  order.updatedAt = new Date();
}

async function markShipmentStatus(
  orderId: Types.ObjectId,
  status: ShipmentStatus,
  patch: Record<string, unknown> = {},
  inc: Record<string, number> = {},
): Promise<void> {
  await ShipmentModel.updateOne(
    { orderId },
    {
      $set: { status, ...patch },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    },
    { upsert: true },
  );
}

async function ensureInvoice(order: OrderDocument): Promise<string> {
  const existing = await InvoiceModel.findOne({ orderId: order._id });
  if (existing) return existing.invoiceNumber;

  const invoiceNumber = `HD-${order.orderCode.replace(/[^0-9A-Za-z]/g, '')}`;
  await InvoiceModel.updateOne(
    { orderId: order._id },
    {
      $setOnInsert: {
        invoiceNumber,
        issuedAt: new Date(),
        totalAmount: order.totalAmount,
      },
    },
    { upsert: true },
  );
  return invoiceNumber;
}

async function toListItem(order: OrderDocument): Promise<OrderListItem> {
  const customer = await requireCustomer(order.userId);
  return toOrderListItem(order, customer);
}

/* ----------------------------- Queries ----------------------------- */

export async function listOrders(query: OrderListQueryInput): Promise<PageResult<OrderListItem>> {
  const filter: QueryFilter<OrderDocument> = {};

  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.paymentStatus && query.paymentStatus !== 'ALL') {
    filter['payment.status'] = query.paymentStatus;
  }

  const from = dateBoundary(query.from);
  const to = dateBoundary(query.to, true);
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q.trim()), 'i');
    const users = await UserModel.find({
      $or: [{ 'profile.fullName': regex }, { phoneNumber: regex }, { email: regex }],
    })
      .select('_id')
      .limit(200)
      .lean();

    filter.$or = [
      { orderCode: regex },
      { 'shippingAddress.recipientPhone': regex },
      ...(users.length ? [{ userId: { $in: users.map((user) => user._id) } }] : []),
    ];
  }

  const sortField = query.sort ?? 'createdAt';
  const direction = query.direction === 'asc' ? 1 : -1;
  const limit = query.limit ?? 20;
  const page = query.page ?? 1;

  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ [sortField]: direction })
      .skip((page - 1) * limit)
      .limit(limit),
    OrderModel.countDocuments(filter),
  ]);

  const userIds = [...new Set(items.map((item) => String(item.userId)))];
  const users = await UserModel.find({ _id: { $in: userIds } }).select('profile email phoneNumber');
  const userMap = new Map(users.map((user) => [String(user._id), toCustomerView(user)]));

  const data = items.map((order) =>
    toOrderListItem(
      order,
      userMap.get(String(order.userId)) ?? {
        _id: order.userId,
        profile: { fullName: order.shippingAddress.recipientName },
        email: null,
        phoneNumber: order.shippingAddress.recipientPhone,
      },
    ),
  );

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getOrder(id: string): Promise<OrderDetail> {
  return loadDetail(await requireOrder(id));
}

export async function getOrderPayment(
  id: string,
): Promise<{ payment: OrderPaymentSummary; allowedNext: OrderStatus[] }> {
  const order = await requireOrder(id);
  const detail = await loadDetail(order);
  return { payment: detail.payment, allowedNext: detail.allowedNext };
}

/* ----------------------------- Commands ----------------------------- */

export async function confirmOrder(id: string, actor: ActorContext): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertTransition(toSharedOrderStatus(order.status), OrderStatus.CONFIRMED);
  appendHistory(order, OrderStatus.CONFIRMED, actor.userId);
  await order.save();
  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_CONFIRM',
    targetType: 'order',
    targetId: String(order._id),
    newValue: { status: order.status },
    ipAddress: actor.ip ?? undefined,
  });
  return loadDetail(order);
}

export async function updateOrderStatus(
  id: string,
  input: UpdateOrderStatusInput,
  actor: ActorContext,
): Promise<OrderDetail> {
  const order = await requireOrder(id);

  if (input.status === OrderStatus.CANCELLED) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Vui lòng dùng chức năng hủy đơn kèm lý do', {
      allowedNext: [],
    });
  }

  assertTransition(toSharedOrderStatus(order.status), input.status);

  if (input.status === OrderStatus.SHIPPING && order.status === OrderStatus.DELIVERY_FAILED) {
    const shipment = await ShipmentModel.findOne({ orderId: order._id });
    assertRedeliveryAllowed(shipment?.redeliveryCount ?? 0);
    await markShipmentStatus(
      order._id,
      ShipmentStatus.SHIPPING,
      { failureReason: null },
      { redeliveryCount: 1 },
    );
  }

  if (input.status === OrderStatus.DELIVERY_FAILED) {
    if (!input.note?.trim()) {
      throw new AppError('VALIDATION_ERROR', 400, 'Cần ghi lý do giao thất bại');
    }
    await markShipmentStatus(order._id, ShipmentStatus.DELIVERY_FAILED, {
      failureReason: input.note.trim(),
    });
  }

  if (input.status === OrderStatus.HANDED_OVER) {
    await markShipmentStatus(order._id, ShipmentStatus.HANDED_OVER);
  }

  if (input.status === OrderStatus.SHIPPING && order.status !== OrderStatus.DELIVERY_FAILED) {
    await markShipmentStatus(order._id, ShipmentStatus.SHIPPING);
  }

  if (input.status === OrderStatus.RETURNING) {
    await markShipmentStatus(order._id, ShipmentStatus.RETURNING);
  }

  if (input.status === OrderStatus.DELIVERED) {
    await markShipmentStatus(order._id, ShipmentStatus.DELIVERED, {
      actualDeliveryDate: new Date(),
    });
    if (order.payment.method === PaymentMethod.COD) {
      order.payment.status = OrderPaymentStatus.PAID;
      order.payment.paidAt = order.payment.paidAt ?? new Date();
    }
  }

  appendHistory(order, input.status, actor.userId, input.note);
  await order.save();

  if (input.status === OrderStatus.DELIVERED) {
    await ensureInvoice(order);
    await issueWarrantyCards(order);
  }

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_STATUS_CHANGE',
    targetType: 'order',
    targetId: String(order._id),
    newValue: { status: order.status, note: input.note ?? null },
    ipAddress: actor.ip,
  });

  return loadDetail(order);
}

export async function cancelOrder(
  id: string,
  input: CancelOrderInput,
  actor: ActorContext,
): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertCancellable(toSharedOrderStatus(order.status));

  appendHistory(order, OrderStatus.CANCELLED, actor.userId, input.note ?? input.reason);
  order.cancellation = {
    reason: input.reason,
    note: input.note ?? null,
    cancelledBy: CancellationActor.ADMIN,
    cancelledByUserId: actor.userId as unknown as OrderDocument['userId'],
    cancelledAt: new Date(),
  };
  await order.save();
  await markShipmentStatus(order._id, ShipmentStatus.PENDING);

  // Đơn đã thu tiền: tạo khoản hoàn đang chờ ở màn Thanh toán & đối soát. Trạng thái thanh toán
  // chỉ chuyển "Đã hoàn tiền" khi Order Admin xác nhận đã chuyển.
  const paid = paidAmountOf(order);
  const refundRequested = paid > 0 && input.refundToCustomer !== false;
  if (refundRequested) {
    await requestRefund({
      order,
      amount: paid,
      source: RefundSource.ORDER_CANCEL,
      note: input.note ?? input.reason,
    });
  }

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_CANCEL',
    targetType: 'order',
    targetId: String(order._id),
    newValue: {
      reason: input.reason,
      note: input.note ?? null,
      refundRequested,
    },
    ipAddress: actor.ip,
  });

  return loadDetail(await requireOrder(id));
}

export async function updateShipment(
  id: string,
  input: UpdateShipmentInput,
  actor: ActorContext,
): Promise<OrderDetail> {
  const order = await requireOrder(id);

  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Đơn đã kết thúc, không cập nhật vận chuyển');
  }

  const patch: Record<string, unknown> = {};
  if (input.carrier !== undefined) patch['carrier'] = input.carrier;
  if (input.trackingCode !== undefined) patch['trackingCode'] = input.trackingCode;
  if (input.assignedTeam !== undefined) patch['assignedTeam'] = input.assignedTeam;
  if (input.installationSchedule !== undefined) {
    patch['installationSchedule'] = input.installationSchedule
      ? new Date(input.installationSchedule)
      : null;
  }

  await ShipmentModel.updateOne({ orderId: order._id }, { $set: patch }, { upsert: true });

  if (input.handover && order.status === OrderStatus.CONFIRMED) {
    assertTransition(toSharedOrderStatus(order.status), OrderStatus.HANDED_OVER);
    appendHistory(order, OrderStatus.HANDED_OVER, actor.userId, 'Bàn giao cho vận chuyển');
    await order.save();
    await markShipmentStatus(order._id, ShipmentStatus.HANDED_OVER);
  }

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_SHIPMENT_UPDATE',
    targetType: 'order',
    targetId: String(order._id),
    newValue: patch,
    ipAddress: actor.ip,
  });

  return loadDetail(order);
}

export async function markDelivered(id: string, actor: ActorContext): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertTransition(toSharedOrderStatus(order.status), OrderStatus.DELIVERED);

  await markShipmentStatus(order._id, ShipmentStatus.DELIVERED, {
    actualDeliveryDate: new Date(),
  });
  if (order.payment.method === PaymentMethod.COD) {
    order.payment.status = OrderPaymentStatus.PAID;
    order.payment.paidAt = order.payment.paidAt ?? new Date();
  }
  appendHistory(order, OrderStatus.DELIVERED, actor.userId, 'Ghi nhận giao thành công');
  await order.save();
  await ensureInvoice(order);
  await issueWarrantyCards(order);

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_DELIVERED',
    targetType: 'order',
    targetId: String(order._id),
    ipAddress: actor.ip,
  });

  return loadDetail(order);
}

export async function markDeliveryFailed(
  id: string,
  input: DeliveryFailedInput,
  actor: ActorContext,
): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertTransition(toSharedOrderStatus(order.status), OrderStatus.DELIVERY_FAILED);

  await markShipmentStatus(order._id, ShipmentStatus.DELIVERY_FAILED, {
    failureReason: input.failureReason,
  });
  appendHistory(
    order,
    OrderStatus.DELIVERY_FAILED,
    actor.userId,
    input.note || input.failureReason,
  );
  await order.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_DELIVERY_FAILED',
    targetType: 'order',
    targetId: String(order._id),
    newValue: { failureReason: input.failureReason },
    ipAddress: actor.ip,
  });

  return loadDetail(order);
}

export async function redeliver(id: string, actor: ActorContext): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertTransition(toSharedOrderStatus(order.status), OrderStatus.SHIPPING);
  const shipment = await ShipmentModel.findOne({ orderId: order._id });
  assertRedeliveryAllowed(shipment?.redeliveryCount ?? 0);

  await markShipmentStatus(
    order._id,
    ShipmentStatus.SHIPPING,
    { failureReason: null },
    { redeliveryCount: 1 },
  );
  appendHistory(order, OrderStatus.SHIPPING, actor.userId, 'Giao lại đơn hàng');
  await order.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_REDELIVER',
    targetType: 'order',
    targetId: String(order._id),
    ipAddress: actor.ip,
  });

  return loadDetail(await requireOrder(id));
}

export async function returnToWarehouse(id: string, actor: ActorContext): Promise<OrderDetail> {
  const order = await requireOrder(id);
  assertTransition(toSharedOrderStatus(order.status), OrderStatus.RETURNING);

  await markShipmentStatus(order._id, ShipmentStatus.RETURNING);
  appendHistory(order, OrderStatus.RETURNING, actor.userId, 'Hoàn hàng về kho');
  await order.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_RETURN_TO_WAREHOUSE',
    targetType: 'order',
    targetId: String(order._id),
    ipAddress: actor.ip,
  });

  return loadDetail(order);
}

export async function finalizeReturn(
  id: string,
  input: FinalizeReturnInput,
  actor: ActorContext,
): Promise<OrderDetail> {
  const order = await requireOrder(id);
  if (order.status !== OrderStatus.RETURNING) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Chỉ hoàn tất hoàn hàng cho đơn đang hoàn');
  }

  const paidAmount = paidAmountOf(order);
  const refundAmount = computeRefundAmount(paidAmount, input.actualShippingCost);

  await ShipmentModel.updateOne(
    { orderId: order._id },
    { $set: { status: ShipmentStatus.RETURNING, actualShippingCost: input.actualShippingCost } },
  );

  appendHistory(
    order,
    OrderStatus.CANCELLED,
    actor.userId,
    input.note ?? 'Đã nhận hàng hoàn về kho',
  );
  await order.save();
  if (refundAmount > 0) {
    await requestRefund({
      order,
      amount: refundAmount,
      source: RefundSource.DELIVERY_FAILED,
      note: input.note ?? 'Hoàn tiền đơn giao thất bại, đã trừ phí vận chuyển thực tế',
    });
  }

  await writeAuditLog({
    userId: actor.userId,
    action: 'ORDER_FINALIZE_RETURN',
    targetType: 'order',
    targetId: String(order._id),
    newValue: { actualShippingCost: input.actualShippingCost, refundAmount },
    ipAddress: actor.ip,
  });

  return loadDetail(await requireOrder(id));
}

/* ----------------------- Late compensation ----------------------- */

export async function listLateCompensations(
  status?: LateCompensationStatus,
): Promise<LateCompensationRequest[]> {
  const filter: QueryFilter<LateCompensationRequestDoc> = {};
  if (status) filter.status = status;

  const rows = await LateCompensationRequestModel.find(filter).sort({ requestedAt: -1 }).limit(100);
  const orderIds = rows.map((row) => row.orderId);
  const orders = await OrderModel.find({ _id: { $in: orderIds } });
  const orderMap = new Map(orders.map((order) => [String(order._id), order]));

  const userIds = [...new Set(orders.map((order) => String(order.userId)))];
  const users = await UserModel.find({ _id: { $in: userIds } }).select('profile email phoneNumber');
  const userMap = new Map(users.map((user) => [String(user._id), toCustomerView(user)]));

  return rows.map((row) => {
    const order = orderMap.get(String(row.orderId));
    const customer = order ? userMap.get(String(order.userId)) : undefined;
    return {
      id: String(row._id),
      orderId: String(row.orderId),
      orderCode: order?.orderCode ?? '',
      customerName:
        customer?.profile?.fullName ?? order?.shippingAddress.recipientName ?? 'Khách hàng',
      customerPhone: order?.shippingAddress.recipientPhone ?? customer?.phoneNumber ?? '',
      daysLate: row.daysLate,
      estimatedDeliveryDate: row.estimatedDeliveryDate.toISOString(),
      actualDeliveryDate: row.actualDeliveryDate ? row.actualDeliveryDate.toISOString() : null,
      voucherValue: row.voucherValue,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      reviewNote: row.reviewNote ?? null,
    };
  });
}

export async function approveLateCompensation(
  id: string,
  actor: ActorContext,
): Promise<LateCompensationRequest> {
  const row = await LateCompensationRequestModel.findById(id);
  if (!row) throw new AppError('COMPENSATION_NOT_FOUND', 404, 'Không tìm thấy yêu cầu bù trễ');
  if (row.status !== LateCompensationStatus.PENDING) {
    throw new AppError('COMPENSATION_ALREADY_REVIEWED', 409, 'Yêu cầu đã được xử lý');
  }

  row.status = LateCompensationStatus.APPROVED;
  row.reviewedAt = new Date();
  row.reviewedBy = actor.userId as unknown as typeof row.reviewedBy;
  await row.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'LATE_COMPENSATION_APPROVE',
    targetType: 'late_compensation',
    targetId: String(row._id),
    newValue: { voucherValue: row.voucherValue },
    ipAddress: actor.ip,
  });

  const [dto] = await listLateCompensationsByIds([String(row._id)]);
  return dto;
}

export async function rejectLateCompensation(
  id: string,
  reason: string,
  actor: ActorContext,
): Promise<LateCompensationRequest> {
  const row = await LateCompensationRequestModel.findById(id);
  if (!row) throw new AppError('COMPENSATION_NOT_FOUND', 404, 'Không tìm thấy yêu cầu bù trễ');
  if (row.status !== LateCompensationStatus.PENDING) {
    throw new AppError('COMPENSATION_ALREADY_REVIEWED', 409, 'Yêu cầu đã được xử lý');
  }

  row.status = LateCompensationStatus.REJECTED;
  row.reviewedAt = new Date();
  row.reviewedBy = actor.userId as unknown as typeof row.reviewedBy;
  row.reviewNote = reason;
  await row.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'LATE_COMPENSATION_REJECT',
    targetType: 'late_compensation',
    targetId: String(row._id),
    newValue: { reason },
    ipAddress: actor.ip,
  });

  const [dto] = await listLateCompensationsByIds([String(row._id)]);
  return dto;
}

async function listLateCompensationsByIds(ids: string[]): Promise<LateCompensationRequest[]> {
  const rows = await LateCompensationRequestModel.find({ _id: { $in: ids } });
  const orders = await OrderModel.find({ _id: { $in: rows.map((row) => row.orderId) } });
  const orderMap = new Map(orders.map((order) => [String(order._id), order]));
  const users = await UserModel.find({ _id: { $in: orders.map((order) => order.userId) } }).select(
    'profile email phoneNumber',
  );
  const userMap = new Map(users.map((user) => [String(user._id), toCustomerView(user)]));

  return rows.map((row) => {
    const order = orderMap.get(String(row.orderId));
    const customer = order ? userMap.get(String(order.userId)) : undefined;
    return {
      id: String(row._id),
      orderId: String(row.orderId),
      orderCode: order?.orderCode ?? '',
      customerName:
        customer?.profile?.fullName ?? order?.shippingAddress.recipientName ?? 'Khách hàng',
      customerPhone: order?.shippingAddress.recipientPhone ?? customer?.phoneNumber ?? '',
      daysLate: row.daysLate,
      estimatedDeliveryDate: row.estimatedDeliveryDate.toISOString(),
      actualDeliveryDate: row.actualDeliveryDate ? row.actualDeliveryDate.toISOString() : null,
      voucherValue: row.voucherValue,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      reviewNote: row.reviewNote ?? null,
    };
  });
}

export { toListItem };

export async function cancelExpiredUnpaidOrders(): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const expiredOrders = await OrderModel.find({
    status: OrderStatus.PENDING_PAYMENT,
    createdAt: { $lt: fifteenMinutesAgo },
  });

  let cancelledCount = 0;
  for (const order of expiredOrders) {
    order.status = OrderStatus.CANCELLED;
    order.cancellation = {
      reason: 'PAYMENT_EXPIRED',
      note: 'Tự động hủy do quá thời hạn thanh toán (15 phút)',
      cancelledBy: CancellationActor.SYSTEM,
      cancelledByUserId: null,
      cancelledAt: new Date(),
    };
    order.statusHistory.push({
      fromStatus: OrderStatus.PENDING_PAYMENT,
      toStatus: OrderStatus.CANCELLED,
      note: 'Hệ thống tự động hủy do quá thời hạn thanh toán (15 phút)',
      changedBy: null,
      changedAt: new Date(),
    });
    order.updatedAt = new Date();
    await order.save();
    cancelledCount++;
  }
  return cancelledCount;
}
