import type { QueryFilter, Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import {
  OrderPaymentStatus,
  PaymentCollectionType,
  OrderStatus,
  ReconciliationStatus,
} from '../../lib/shared-enums.js';
import type { PaymentException, PaymentTransaction } from '../../lib/shared-types.js';
import { UserModel } from '../auth/auth.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { OrderModel, toSharedOrderStatus, type OrderDocument } from '../orders/order.model.js';
import {
  PaymentTransactionModel,
  type PaymentTransactionDocument,
  type PaymentTransactionDoc,
} from './payment.model.js';
import {
  assertResolutionNote,
  assertResolvable,
  expectedAmountOf,
  isException,
  resolveOutcome,
} from './payment.rules.js';
import type { PaymentListQueryInput, ResolvePaymentInput } from './payment.schema.js';

export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ActorContext {
  userId: string;
  ip?: string | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface OrderLookup {
  orderCode: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
}

async function loadOrderLookup(orderIds: unknown[]): Promise<Map<string, OrderLookup>> {
  const ids = [...new Set(orderIds.map(String))];
  if (!ids.length) return new Map();

  const orders = await OrderModel.find({ _id: { $in: ids } });
  const users = await UserModel.find({ _id: { $in: orders.map((order) => order.userId) } }).select(
    'profile',
  );
  const nameMap = new Map(users.map((user) => [String(user._id), user.profile?.fullName ?? '']));

  return new Map(
    orders.map((order) => [
      String(order._id),
      {
        orderCode: order.orderCode,
        customerName: nameMap.get(String(order.userId)) || order.shippingAddress.recipientName,
        status: toSharedOrderStatus(order.status),
        totalAmount: order.totalAmount,
      },
    ]),
  );
}

function toTransactionDto(doc: PaymentTransactionDoc, order?: OrderLookup): PaymentTransaction {
  return {
    id: String(doc._id),
    orderId: doc.orderId ? String(doc.orderId) : null,
    orderCode: order?.orderCode ?? null,
    customerName: order?.customerName ?? null,
    type: doc.type,
    amount: doc.amount,
    recordSource: doc.recordSource,
    bankTransactionCode: doc.bankTransactionCode ?? null,
    receivedContent: doc.receivedContent ?? null,
    reconciliationStatus: doc.reconciliationStatus,
    status: doc.status,
    note: doc.note ?? null,
    handledBy: doc.handledByName ?? null,
    transactionAt: doc.transactionAt.toISOString(),
    refundAccount: doc.refundAccount
      ? {
          bankName: doc.refundAccount.bankName,
          accountNumber: doc.refundAccount.accountNumber,
          accountHolder: doc.refundAccount.accountHolder,
        }
      : null,
  };
}

async function requireTransaction(id: string): Promise<PaymentTransactionDocument> {
  const doc = await PaymentTransactionModel.findById(id);
  if (!doc) {
    throw new AppError('PAYMENT_TRANSACTION_NOT_FOUND', 404, 'Không tìm thấy giao dịch');
  }
  return doc;
}

async function actorName(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select('profile');
  return user?.profile?.fullName ?? null;
}

/* ----------------------------- Queries ----------------------------- */

export async function listPayments(
  query: PaymentListQueryInput,
): Promise<PageResult<PaymentTransaction>> {
  const filter: QueryFilter<PaymentTransactionDoc> = {};

  if (query.reconciliationStatus && query.reconciliationStatus !== 'ALL') {
    filter.reconciliationStatus = query.reconciliationStatus;
  }

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q.trim()), 'i');
    const [orders, users] = await Promise.all([
      OrderModel.find({ orderCode: regex }).select('_id').limit(200).lean(),
      UserModel.find({ 'profile.fullName': regex }).select('_id').limit(200).lean(),
    ]);
    const orderIds = orders.map((order) => order._id);
    const userIds = users.map((user) => user._id);
    const userOrders = userIds.length
      ? await OrderModel.find({ userId: { $in: userIds } })
          .select('_id')
          .limit(200)
          .lean()
      : [];

    filter.$or = [
      { bankTransactionCode: regex },
      { receivedContent: regex },
      ...(orderIds.length || userOrders.length
        ? [{ orderId: { $in: [...orderIds, ...userOrders.map((order) => order._id)] } }]
        : []),
    ];
  }

  const limit = query.limit ?? 20;
  const page = query.page ?? 1;

  const [docs, total] = await Promise.all([
    PaymentTransactionModel.find(filter)
      .sort({ transactionAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PaymentTransactionModel.countDocuments(filter),
  ]);

  const lookup = await loadOrderLookup(docs.map((doc) => doc.orderId).filter(Boolean));

  return {
    data: docs.map((doc) => toTransactionDto(doc, lookup.get(String(doc.orderId)))),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function listPaymentExceptions(): Promise<PaymentException[]> {
  const docs = await PaymentTransactionModel.find({
    reconciliationStatus: {
      $in: [
        ReconciliationStatus.WRONG_CONTENT,
        ReconciliationStatus.UNDERPAID,
        ReconciliationStatus.OVERPAID,
        ReconciliationStatus.LATE,
      ],
    },
  }).sort({ transactionAt: -1 });

  const orderIds = docs
    .map((doc) => doc.orderId)
    .filter((value): value is Types.ObjectId => Boolean(value));

  const lookup = await loadOrderLookup(orderIds);
  const orders = await OrderModel.find({ _id: { $in: orderIds } });
  const orderMap = new Map(orders.map((order) => [String(order._id), order]));

  return docs.map((doc) => {
    const order = doc.orderId ? orderMap.get(String(doc.orderId)) : undefined;
    const info = lookup.get(String(doc.orderId));
    return {
      transaction: toTransactionDto(doc, info),
      orderStatus: info?.status ?? OrderStatus.PENDING_PAYMENT,
      expectedAmount: order ? expectedAmountOf(order) : doc.amount,
      receivedAmount: doc.amount,
      reason: doc.reconciliationStatus,
      transferContent: doc.receivedContent ?? null,
    };
  });
}

/* ----------------------------- Commands ----------------------------- */

export async function resolvePayment(
  transactionId: string,
  input: ResolvePaymentInput,
  actor: ActorContext,
): Promise<PaymentTransaction> {
  assertResolutionNote(input.note);
  const doc = await requireTransaction(transactionId);
  assertResolvable(doc);

  const outcome = resolveOutcome(input.action);

  if (outcome.markOrderPaid) {
    const orderId = input.orderId ?? (doc.orderId ? String(doc.orderId) : null);
    if (!orderId) {
      throw new AppError('ORDER_REQUIRED', 400, 'Cần chọn đơn hàng để ghi nhận thanh toán');
    }
    const order = await OrderModel.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
    applyPaidToOrder(order, doc);
    await order.save();
    doc.orderId = order._id;
  }

  doc.reconciliationStatus = outcome.reconciliationStatus;
  doc.status = outcome.status;
  doc.recordSource = 'MANUAL';
  doc.note = input.note.trim();
  doc.handledById = actor.userId as unknown as PaymentTransactionDoc['handledById'];
  doc.handledByName = await actorName(actor.userId);
  await doc.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'PAYMENT_RESOLVE',
    targetType: 'payment_transaction',
    targetId: String(doc._id),
    newValue: {
      action: input.action,
      reconciliationStatus: doc.reconciliationStatus,
      orderId: doc.orderId ? String(doc.orderId) : null,
      note: doc.note,
    },
    ipAddress: actor.ip,
  });

  const lookup = await loadOrderLookup(doc.orderId ? [doc.orderId] : []);
  return toTransactionDto(doc, lookup.get(String(doc.orderId)));
}

function applyPaidToOrder(order: OrderDocument, doc: PaymentTransactionDoc): void {
  const deposit =
    order.payment.collectionType === PaymentCollectionType.DEPOSIT &&
    doc.amount < order.totalAmount;

  order.payment.status = deposit ? OrderPaymentStatus.DEPOSITED : OrderPaymentStatus.PAID;
  order.payment.paidAt = order.payment.paidAt ?? new Date();
  order.payment.lastTransactionCode = doc.bankTransactionCode ?? null;

  if (!deposit) {
    order.payment.depositAmount = null;
    order.payment.codAmount = null;
  }

  if (order.status === OrderStatus.PENDING_PAYMENT) {
    order.statusHistory.push({
      fromStatus: order.status,
      toStatus: OrderStatus.PENDING_CONFIRMATION,
      note: 'Đối soát thủ công: đã ghi nhận thanh toán',
      changedAt: new Date(),
      changedBy: null,
    });
    order.status = OrderStatus.PENDING_CONFIRMATION;
  }
}

export { isException };
