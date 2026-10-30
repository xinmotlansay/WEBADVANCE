/** Tên và màu badge theo trạng thái (requirements Phần A mục 1.3, admin-ui-rule mục 2). */
export type Tone = 'ok' | 'attn' | 'danger' | 'info' | 'neutral';

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const ORDER_STATUS: Record<string, StatusMeta> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', tone: 'neutral' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'attn' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'info' },
  HANDED_OVER: { label: 'Đã giao cho ĐVVC', tone: 'info' },
  SHIPPING: { label: 'Đang giao', tone: 'info' },
  DELIVERED: { label: 'Giao thành công', tone: 'ok' },
  DELIVERY_FAILED: { label: 'Giao thất bại', tone: 'danger' },
  RETURNING: { label: 'Đang hoàn hàng', tone: 'attn' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

/** Thứ tự hiển thị 9 trạng thái đơn. */
export const ORDER_STATUS_ORDER = Object.keys(ORDER_STATUS);

export const PRODUCT_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { label: 'Đang bán', tone: 'ok' },
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  HIDDEN: { label: 'Đang ẩn', tone: 'neutral' },
  DISCONTINUED: { label: 'Ngừng KD', tone: 'danger' },
};

export const STOCK_STATE: Record<string, StatusMeta> = {
  OK: { label: 'Còn hàng', tone: 'ok' },
  LOW: { label: 'Sắp hết', tone: 'attn' },
  OUT: { label: 'Hết hàng', tone: 'danger' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  COD: 'COD',
  BANK_TRANSFER: 'Chuyển khoản QR',
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  PENDING: { label: 'Chờ thanh toán', tone: 'neutral' },
  DEPOSITED: { label: 'Đã cọc', tone: 'info' },
  PAID: { label: 'Đã thanh toán', tone: 'ok' },
  UNPAID: { label: 'Chưa thanh toán (COD)', tone: 'attn' },
  FAILED: { label: 'Thất bại', tone: 'danger' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'neutral' },
};

export const DELIVERED_BY: Record<string, string> = {
  FLEET: 'Đội xe',
  PARTNER: 'Đối tác',
};

export function toneClass(meta: StatusMeta | undefined): string {
  return `badge b-${meta?.tone ?? 'neutral'}`;
}
