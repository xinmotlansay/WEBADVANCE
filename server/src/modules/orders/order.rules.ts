import { AppError } from '../../lib/app-error.js';
import { MAX_REDELIVERY_COUNT } from '../../lib/shared-enums.js';
import { ORDER_ALLOWED_NEXT, OrderStatus } from '../../lib/shared-enums.js';

/** Trạng thái còn được phép hủy trực tiếp (trước khi bàn giao). */
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
];

export function allowedNext(status: OrderStatus): OrderStatus[] {
  return [...ORDER_ALLOWED_NEXT[status]];
}

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

/** Ném 409 kèm `allowedNext` để UI hiển thị đúng bước hợp lệ. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = ORDER_ALLOWED_NEXT[from];
  if (!allowed.includes(to)) {
    throw new AppError(
      'ORDER_INVALID_STATE',
      409,
      `Không thể chuyển đơn từ ${from} sang ${to}`,
      { from, to, allowedNext: allowed },
    );
  }
}

export function assertCancellable(status: OrderStatus): void {
  if (!canCancel(status)) {
    throw new AppError(
      'ORDER_CANCEL_NOT_ALLOWED',
      409,
      'Đơn đã bàn giao hoặc đã kết thúc, không thể hủy trực tiếp',
      { status, allowedNext: allowedNext(status) },
    );
  }
}

export function assertRedeliveryAllowed(redeliveryCount: number): void {
  if (redeliveryCount >= MAX_REDELIVERY_COUNT) {
    throw new AppError(
      'REDELIVERY_LIMIT_REACHED',
      409,
      `Đơn đã giao lại ${MAX_REDELIVERY_COUNT} lần, cần hoàn hàng về kho`,
      { redeliveryCount, max: MAX_REDELIVERY_COUNT },
    );
  }
}

/** Hoàn tiền = đã thu − phí vận chuyển thực tế, không âm. */
export function computeRefundAmount(paidAmount: number, actualShippingCost: number): number {
  const paid = Number.isFinite(paidAmount) ? Math.max(0, paidAmount) : 0;
  const cost = Number.isFinite(actualShippingCost) ? Math.max(0, actualShippingCost) : 0;
  return Math.max(0, paid - cost);
}

/** Đơn chờ xác nhận quá 20 giờ được coi là quá hạn. */
export const OVERDUE_CONFIRMATION_HOURS = 20;

export function isOverdueConfirmation(status: OrderStatus, createdAt: Date, now = new Date()): boolean {
  if (status !== OrderStatus.PENDING_CONFIRMATION) return false;
  return now.getTime() - createdAt.getTime() > OVERDUE_CONFIRMATION_HOURS * 3_600_000;
}

/** Mốc hạn thanh toán QR: 15 phút kể từ khi tạo đơn. */
export const PAYMENT_DUE_MINUTES = 15;
