/** 9 trạng thái đơn hàng — mục 1.3 Phần A, requirements.md */
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  HANDED_OVER = 'HANDED_OVER',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RETURNING = 'RETURNING',
  CANCELLED = 'CANCELLED',
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: 'Chờ thanh toán',
  [OrderStatus.PENDING_CONFIRMATION]: 'Chờ xác nhận',
  [OrderStatus.CONFIRMED]: 'Đã xác nhận',
  [OrderStatus.HANDED_OVER]: 'Đã giao cho đơn vị vận chuyển',
  [OrderStatus.SHIPPING]: 'Đang giao',
  [OrderStatus.DELIVERED]: 'Giao hàng thành công',
  [OrderStatus.DELIVERY_FAILED]: 'Giao thất bại',
  [OrderStatus.RETURNING]: 'Đang hoàn hàng',
  [OrderStatus.CANCELLED]: 'Đã hủy',
};

export type OrderBadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ORDER_STATUS_TONE: Record<OrderStatus, OrderBadgeTone> = {
  [OrderStatus.PENDING_PAYMENT]: 'neutral',
  [OrderStatus.PENDING_CONFIRMATION]: 'warning',
  [OrderStatus.CONFIRMED]: 'info',
  [OrderStatus.HANDED_OVER]: 'info',
  [OrderStatus.SHIPPING]: 'info',
  [OrderStatus.DELIVERED]: 'success',
  [OrderStatus.DELIVERY_FAILED]: 'danger',
  [OrderStatus.RETURNING]: 'warning',
  [OrderStatus.CANCELLED]: 'danger',
};

/** Bảng 11.4 API Design — bước chuyển hợp lệ do Order Admin thực hiện */
export const ORDER_ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PENDING_CONFIRMATION, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_CONFIRMATION]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.HANDED_OVER, OrderStatus.CANCELLED],
  [OrderStatus.HANDED_OVER]: [OrderStatus.SHIPPING],
  [OrderStatus.SHIPPING]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.DELIVERY_FAILED]: [OrderStatus.SHIPPING, OrderStatus.RETURNING],
  [OrderStatus.RETURNING]: [OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
};

export enum CancellationActor {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

export const CANCEL_REASONS: Array<{ value: string; label: string }> = [
  { value: 'OUT_OF_STOCK_ACTUAL', label: 'Hết hàng thực tế' },
  { value: 'SUSPECTED_FRAUD', label: 'Nghi ngờ gian lận' },
  { value: 'CUSTOMER_REQUEST', label: 'Khách yêu cầu hủy' },
  { value: 'CANNOT_CONTACT', label: 'Không liên hệ được khách' },
  { value: 'DELIVERY_NOT_POSSIBLE', label: 'Không thể giao hàng' },
  { value: 'OTHER', label: 'Lý do khác' },
];
