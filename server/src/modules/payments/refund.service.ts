import type { ClientSession, Types } from 'mongoose';
import {
  OrderPaymentStatus,
  ReconciliationStatus,
  RefundDestination,
  RefundSource,
  RefundStatus,
  TransactionType,
} from '../../lib/shared-enums.js';
import { OrderModel } from '../orders/order.model.js';
import { PaymentTransactionModel, type PaymentTransactionDoc } from './payment.model.js';
import {
  assertRefundWithinPaid,
  isFullyRefunded,
  isOrderRefundSource,
  ORDER_REFUND_SOURCES,
  paidAmountOf,
  refundDestinationFor,
} from './payment.rules.js';

export interface RefundableOrder {
  _id: Types.ObjectId;
  totalAmount: number;
  payment: {
    method: string;
    status: string;
    depositAmount?: number | null;
    lastTransactionCode?: string | null;
    statusBeforeRefund?: string | null;
  };
}

export interface RefundAccountInput {
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
}

export interface RequestRefundInput {
  order: RefundableOrder;
  amount: number;
  source: RefundSource;
  note?: string;
  /** Tài khoản khách nhập. Chỉ dùng cho đơn COD; đơn chuyển khoản hoàn về tài khoản nguồn. */
  refundAccount?: RefundAccountInput | null;
  returnRequestId?: Types.ObjectId;
  session?: ClientSession;
}

async function sumRefunds(
  orderId: Types.ObjectId,
  statuses: RefundStatus[],
  session?: ClientSession,
): Promise<number> {
  const rows = await PaymentTransactionModel.find({
    orderId,
    type: TransactionType.REFUND,
    status: { $in: statuses },
  })
    .select('amount')
    .session(session ?? null)
    .lean();
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

function accountOf(account?: RefundAccountInput | null): PaymentTransactionDoc['refundAccount'] {
  if (!account?.accountNumber) return null;
  return {
    bankName: account.bankName ?? '',
    accountNumber: account.accountNumber,
    accountHolder: account.accountHolder ?? '',
  };
}

/**
 * Tạo khoản hoàn tiền đang chờ Order Admin chuyển. Đơn chuyển khoản hoàn về tài khoản đã chuyển
 * tới (kèm mã giao dịch gốc để tra); đơn COD hoàn về tài khoản khách đã nhập.
 * Khoản của cùng một yêu cầu trả hàng chỉ tạo một lần.
 */
export async function requestRefund(input: RequestRefundInput): Promise<PaymentTransactionDoc> {
  const { order, amount, session } = input;

  if (input.returnRequestId) {
    const existing = await PaymentTransactionModel.findOne({
      returnRequestId: input.returnRequestId,
      type: TransactionType.REFUND,
    })
      .session(session ?? null)
      .lean();
    if (existing) return existing;
  }

  const requested = await sumRefunds(
    order._id,
    [RefundStatus.PENDING, RefundStatus.PROCESSING, RefundStatus.COMPLETED],
    session,
  );
  assertRefundWithinPaid(paidAmountOf(order), requested, amount);

  const refundTo = refundDestinationFor(order.payment.method);
  const [created] = await PaymentTransactionModel.create(
    [
      {
        orderId: order._id,
        returnRequestId: input.returnRequestId ?? null,
        type: TransactionType.REFUND,
        amount,
        recordSource: 'AUTO',
        reconciliationStatus: ReconciliationStatus.MATCHED,
        status: RefundStatus.PENDING,
        note: input.note ?? null,
        transactionAt: new Date(),
        refundSource: input.source,
        refundTo,
        refundAccount:
          refundTo === RefundDestination.CUSTOMER_ACCOUNT ? accountOf(input.refundAccount) : null,
        originalTransactionCode: order.payment.lastTransactionCode ?? null,
      },
    ],
    { session },
  );

  if (isOrderRefundSource(input.source) && ['PAID', 'DEPOSITED'].includes(order.payment.status)) {
    // Đơn hủy đã thu tiền: trạng thái thanh toán của đơn sang "Chờ hoàn tiền".
    await OrderModel.updateOne(
      { _id: order._id, 'payment.status': { $in: ['PAID', 'DEPOSITED'] } },
      {
        $set: {
          'payment.status': OrderPaymentStatus.REFUND_PENDING,
          'payment.statusBeforeRefund': order.payment.status,
        },
      },
      { session },
    );
  }
  return created.toObject();
}

/** Order Admin xác nhận hoàn tiền: đơn "Chờ hoàn tiền" sang "Đang hoàn tiền". */
export async function markOrderRefunding(orderId: Types.ObjectId): Promise<void> {
  await OrderModel.updateOne(
    { _id: orderId, 'payment.status': OrderPaymentStatus.REFUND_PENDING },
    { $set: { 'payment.status': OrderPaymentStatus.REFUNDING } },
  );
}

/**
 * Khoản hoàn cho tiền chuyển lệch (sai nội dung, thiếu/thừa, trễ hạn). Tiền này chưa được ghi
 * vào đơn nên không kiểm tra theo số đã thu của đơn; luôn hoàn về tài khoản đã chuyển.
 */
export async function requestReconciliationRefund(input: {
  orderId?: Types.ObjectId | null;
  amount: number;
  bankTransactionCode?: string | null;
  note: string;
}): Promise<PaymentTransactionDoc> {
  const created = await PaymentTransactionModel.create({
    orderId: input.orderId ?? null,
    type: TransactionType.REFUND,
    amount: input.amount,
    recordSource: 'MANUAL',
    reconciliationStatus: ReconciliationStatus.MATCHED,
    status: RefundStatus.PENDING,
    note: input.note,
    transactionAt: new Date(),
    refundSource: RefundSource.RECONCILIATION,
    refundTo: RefundDestination.SOURCE_BANK,
    originalTransactionCode: input.bankTransactionCode ?? null,
  });
  return created.toObject();
}

/**
 * Sau khi một khoản hoàn xong: nếu tổng đã hoàn bằng số tiền đơn đã thu thì đơn chuyển sang
 * "Đã hoàn tiền". Hoàn một phần (trả một sản phẩm) thì giữ nguyên trạng thái thanh toán.
 */
export async function settleOrderRefundStatus(
  orderId: Types.ObjectId,
  session?: ClientSession,
): Promise<boolean> {
  const order = await OrderModel.findById(orderId).session(session ?? null);
  if (!order) return false;
  const paid = paidAmountOf(order);
  const [completed, pending] = await Promise.all([
    sumRefunds(orderId, [RefundStatus.COMPLETED], session),
    sumRefunds(orderId, [RefundStatus.PENDING, RefundStatus.PROCESSING], session),
  ]);
  if (!isFullyRefunded(paid, completed, { pending, orderCancelled: order.status === 'CANCELLED' })) {
    return false;
  }
  order.payment.status = OrderPaymentStatus.REFUNDED;
  await order.save({ session });
  return true;
}

/**
 * Khoản hoàn của đơn bị hủy hoặc giao thất bại (mỗi đơn lấy khoản mới nhất, bỏ qua khoản thất bại).
 * Dùng để hiện trạng thái hoàn tiền trên đơn cho cả admin lẫn khách.
 */
export async function findOrderRefunds(
  orderIds: Types.ObjectId[],
): Promise<Map<string, PaymentTransactionDoc>> {
  if (!orderIds.length) return new Map();
  const docs = await PaymentTransactionModel.find({
    orderId: { $in: orderIds },
    type: TransactionType.REFUND,
    refundSource: { $in: ORDER_REFUND_SOURCES },
    status: { $ne: RefundStatus.FAILED },
  })
    .sort({ createdAt: -1 })
    .lean();
  const latest = new Map<string, PaymentTransactionDoc>();
  for (const doc of docs) {
    const key = String(doc.orderId);
    if (!latest.has(key)) latest.set(key, doc);
  }
  return latest;
}
