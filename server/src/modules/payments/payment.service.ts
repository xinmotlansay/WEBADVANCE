import type { QueryFilter, Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import {
  OrderPaymentStatus,
  PaymentCollectionType,
  OrderStatus,
  ReconciliationStatus,
  RefundStatus,
  TransactionType,
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
import { refundReturn, startReturnRefund } from '../returns/return.service.js';
import { ReturnRequestModel } from '../returns/return.model.js';
import {
  markOrderRefunding,
  requestReconciliationRefund,
  settleOrderRefundStatus,
} from './refund.service.js';
import {
  assertRefundCompletable,
  assertRefundStartable,
  assertResolutionNote,
  assertResolvable,
  isOrderRefundSource,
  expectedAmountOf,
  isException,
  resolveOutcome,
} from './payment.rules.js';
import type {
  CompleteRefundInput,
  PaymentListQueryInput,
  ResolvePaymentInput,
  StartRefundInput,
} from './payment.schema.js';

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

async function loadReturnCodes(docs: PaymentTransactionDoc[]): Promise<Map<string, string>> {
  const ids = docs
    .map((doc) => doc.returnRequestId)
    .filter((value): value is Types.ObjectId => Boolean(value));
  if (!ids.length) return new Map();
  const returns = await ReturnRequestModel.find({ _id: { $in: ids } }).select('code').lean();
  return new Map(returns.map((item) => [String(item._id), String(item.code ?? '')]));
}

function toTransactionDto(
  doc: PaymentTransactionDoc,
  order?: OrderLookup,
  returnCode?: string | null,
): PaymentTransaction {
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
    refundTo: doc.refundTo ?? null,
    refundSource: doc.refundSource ?? null,
    originalTransactionCode: doc.originalTransactionCode ?? null,
    proofImage: doc.proofImage ?? null,
    returnRequestId: doc.returnRequestId ? String(doc.returnRequestId) : null,
    returnCode: returnCode ?? null,
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
  if (query.type && query.type !== 'ALL') filter.type = query.type;
  if (query.status && query.status !== 'ALL') filter.status = query.status;

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

  const [lookup, returnCodes] = await Promise.all([
    loadOrderLookup(docs.map((doc) => doc.orderId).filter(Boolean)),
    loadReturnCodes(docs),
  ]);

  return {
    data: docs.map((doc) =>
      toTransactionDto(doc, lookup.get(String(doc.orderId)), returnCodes.get(String(doc.returnRequestId))),
    ),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** Hàng đợi hoàn tiền: khoản chờ hoàn và đang hoàn, khoản cũ nhất lên đầu. */
export async function listPendingRefunds(): Promise<PaymentTransaction[]> {
  const docs = await PaymentTransactionModel.find({
    type: TransactionType.REFUND,
    status: { $in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
  }).sort({ transactionAt: 1 });
  const [lookup, returnCodes] = await Promise.all([
    loadOrderLookup(docs.map((doc) => doc.orderId).filter(Boolean)),
    loadReturnCodes(docs),
  ]);
  return docs.map((doc) =>
    toTransactionDto(doc, lookup.get(String(doc.orderId)), returnCodes.get(String(doc.returnRequestId))),
  );
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

  if (outcome.refund) {
    // Tiền chuyển lệch được trả lại đúng tài khoản đã chuyển; việc chuyển trả nằm ở hàng đợi hoàn tiền.
    await requestReconciliationRefund({
      orderId: doc.orderId ?? null,
      amount: doc.amount,
      bankTransactionCode: doc.bankTransactionCode ?? null,
      note: `Hoàn lại giao dịch ${doc.bankTransactionCode ?? String(doc._id)}: ${doc.note ?? ''}`.trim(),
    });
  }

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

/**
 * Bước 1: Order Admin xác nhận hoàn tiền. Khoản hoàn "Chờ hoàn tiền" chuyển sang "Đang hoàn tiền";
 * yêu cầu trả hàng liên quan cũng chuyển sang "Đang hoàn tiền".
 */
export async function startRefund(
  transactionId: string,
  input: StartRefundInput,
  actor: ActorContext,
): Promise<PaymentTransaction> {
  const doc = await requireTransaction(transactionId);
  assertRefundStartable(doc);

  if (doc.returnRequestId) {
    await startReturnRefund(String(doc.returnRequestId), actor);
  }
  doc.status = RefundStatus.PROCESSING;
  doc.recordSource = 'MANUAL';
  doc.handledById = actor.userId as unknown as PaymentTransactionDoc['handledById'];
  doc.handledByName = await actorName(actor.userId);
  if (input.note?.trim()) doc.note = input.note.trim();
  await doc.save();
  if (doc.orderId && isOrderRefundSource(doc.refundSource)) await markOrderRefunding(doc.orderId);

  await writeAuditLog({
    userId: actor.userId,
    action: 'REFUND_START',
    targetType: 'payment_transaction',
    targetId: transactionId,
    newValue: {
      amount: doc.amount,
      refundTo: doc.refundTo ?? null,
      orderId: doc.orderId ? String(doc.orderId) : null,
      returnRequestId: doc.returnRequestId ? String(doc.returnRequestId) : null,
    },
    ipAddress: actor.ip,
  });

  const [lookup, returnCodes] = await Promise.all([
    loadOrderLookup(doc.orderId ? [doc.orderId] : []),
    loadReturnCodes([doc]),
  ]);
  return toTransactionDto(doc, lookup.get(String(doc.orderId)), returnCodes.get(String(doc.returnRequestId)));
}

/**
 * Bước 2: hoàn tất hoàn tiền. Chưa nối ngân hàng nên Order Admin báo thủ công (kèm chứng từ); xong thì
 * yêu cầu trả hàng tự chuyển "Hoàn tất" và đơn sang "Đã hoàn tiền" khi đã hoàn đủ.
 */
export async function completeRefund(
  transactionId: string,
  input: CompleteRefundInput,
  actor: ActorContext,
): Promise<PaymentTransaction> {
  assertResolutionNote(input.note);
  const doc = await requireTransaction(transactionId);
  assertRefundCompletable(doc);

  const amount = input.amount ?? doc.amount;
  if (amount > doc.amount) {
    throw new AppError('REFUND_AMOUNT_EXCEEDED', 400, 'Số tiền hoàn vượt số tiền cần hoàn');
  }

  if (doc.returnRequestId) {
    // Khoản hoàn của yêu cầu trả hàng: hoàn tất cả yêu cầu trả hàng lẫn giao dịch ở một chỗ.
    await refundReturn(
      String(doc.returnRequestId),
      { amount, proofImage: input.proofImage, transactionAt: input.transactionAt },
      actor,
    );
  } else {
    doc.amount = amount;
    doc.status = RefundStatus.COMPLETED;
    doc.proofImage = input.proofImage;
    doc.transactionAt = new Date(input.transactionAt);
    doc.recordSource = 'MANUAL';
    doc.handledById = actor.userId as unknown as PaymentTransactionDoc['handledById'];
    doc.handledByName = await actorName(actor.userId);
    await doc.save();
    if (doc.orderId) await settleOrderRefundStatus(doc.orderId);
  }

  const done = await requireTransaction(transactionId);
  done.note = input.note.trim();
  await done.save();

  await writeAuditLog({
    userId: actor.userId,
    action: 'REFUND_COMPLETE',
    targetType: 'payment_transaction',
    targetId: transactionId,
    newValue: {
      amount,
      refundTo: done.refundTo ?? null,
      orderId: done.orderId ? String(done.orderId) : null,
      returnRequestId: done.returnRequestId ? String(done.returnRequestId) : null,
      note: done.note,
    },
    ipAddress: actor.ip,
  });

  const [lookup, returnCodes] = await Promise.all([
    loadOrderLookup(done.orderId ? [done.orderId] : []),
    loadReturnCodes([done]),
  ]);
  return toTransactionDto(done, lookup.get(String(done.orderId)), returnCodes.get(String(done.returnRequestId)));
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
