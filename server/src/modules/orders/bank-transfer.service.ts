import mongoose from 'mongoose';
import { OrderModel, type OrderDoc } from './order.model.js';
import { amountDue } from './order.service.js';
import { PaymentTransactionModel, type ReconciliationStatus } from './payment-transaction.model.js';

export interface BankTransferEvent {
  transactionCode: string;
  amount: number;
  content: string;
  transactionAt: Date;
}

/**
 * Lấy nội dung chuyển khoản của đơn trong nội dung ngân hàng gửi về. Ngân hàng hay bỏ dấu `-`,
 * đổi chữ thường hoặc chèn thêm chữ, nên tìm theo mẫu rồi chuẩn hóa về `CV261017-0001-K7Q2`.
 */
export function extractTransferContent(content: string): string | null {
  const m = content.toUpperCase().match(/CV(\d{6})-?(\d{4})-?([A-Z0-9]{4})/);
  return m ? `CV${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Bảng đối chiếu API Design 8.4. */
export function classifyTransfer(
  order: Pick<OrderDoc, 'status' | 'payment' | 'totalAmount'> | null,
  amount: number,
  transactionAt: Date,
): ReconciliationStatus {
  if (!order) return 'WRONG_CONTENT';
  const overdue = !!order.payment.dueAt && transactionAt > order.payment.dueAt;
  if (order.status === 'CANCELLED' || overdue) return 'LATE';
  // Đơn đã ghi nhận tiền trước đó: khoản này là tiền thừa.
  if (order.status !== 'PENDING_PAYMENT') return 'OVERPAID';
  const due = amountDue(order);
  if (amount < due) return 'UNDERPAID';
  if (amount > due) return 'OVERPAID';
  return 'MATCHED';
}

/**
 * Webhook ngân hàng (FR-38). Idempotent theo `transactionCode`. Khớp thì đơn sang
 * `PENDING_CONFIRMATION`; ngoại lệ chỉ lưu giao dịch để Order Admin đối soát (OA-08).
 */
export async function handleBankTransfer(
  event: BankTransferEvent,
): Promise<{ duplicate: boolean; reconciliationStatus?: ReconciliationStatus }> {
  if (await PaymentTransactionModel.exists({ bankTransactionCode: event.transactionCode })) {
    return { duplicate: true };
  }
  const content = extractTransferContent(event.content);
  const order = content
    ? await OrderModel.findOne({ 'payment.transferContent': content }).lean<OrderDoc>()
    : null;

  try {
    const status = await mongoose.connection.transaction(async (session) => {
      let result = classifyTransfer(order, event.amount, event.transactionAt);
      if (result === 'MATCHED' && order) {
        const deposit = order.payment.collectionType === 'DEPOSIT';
        const updated = await OrderModel.updateOne(
          { _id: order._id, status: 'PENDING_PAYMENT' },
          {
            $set: {
              status: 'PENDING_CONFIRMATION',
              'payment.status': deposit ? 'DEPOSITED' : 'PAID',
              'payment.paidAt': event.transactionAt,
              'payment.lastTransactionCode': event.transactionCode,
            },
            $push: {
              statusHistory: {
                changedBy: null,
                fromStatus: 'PENDING_PAYMENT',
                toStatus: 'PENDING_CONFIRMATION',
                note: 'Ngân hàng báo đã nhận tiền',
                changedAt: new Date(),
              },
            },
          },
          { session },
        );
        // Đơn vừa bị hủy vì hết hạn trong lúc xử lý.
        if (updated.modifiedCount === 0) result = 'LATE';
      }
      await PaymentTransactionModel.create(
        [
          {
            orderId: order?._id ?? null,
            type: order?.payment.collectionType === 'DEPOSIT' ? 'DEPOSIT' : 'FULL_PAYMENT',
            amount: event.amount,
            recordSource: 'AUTO',
            bankTransactionCode: event.transactionCode,
            receivedContent: event.content,
            reconciliationStatus: result,
            transactionAt: event.transactionAt,
          },
        ],
        { session },
      );
      // Tiền không được ghi nhận cho đơn (thiếu, thừa, trễ): tạo lệnh hoàn để Order Admin chuyển trả.
      // Sai nội dung thì không biết đơn nào, Order Admin đối soát tay (OA-08).
      if (order && result !== 'MATCHED') {
        await PaymentTransactionModel.create(
          [
            {
              orderId: order._id,
              type: 'REFUND',
              amount: event.amount,
              recordSource: 'AUTO',
              status: 'PENDING',
              note: `Hoàn giao dịch ${event.transactionCode} (${result})`,
            },
          ],
          { session },
        );
      }
      return result;
    });
    // ponytail: chưa có module notifications cho Admin; giao dịch lệch chỉ ghi log, thêm thông báo
    // RECONCILIATION khi làm OA-08.
    if (status !== 'MATCHED') {
      console.warn(`Giao dịch ${event.transactionCode} cần đối soát: ${status}`);
    }
    return { duplicate: false, reconciliationStatus: status };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { duplicate: true };
    throw err;
  }
}
