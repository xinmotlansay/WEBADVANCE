import type { OrderStatus } from './super-admin.models';

export type BadgeTone = 'success' | 'attention' | 'danger' | 'info' | 'neutral';

/** Đúng 9 trạng thái đơn ở Requirements mục 1.3 Phần A; màu theo admin-ui-rule mục 2. */
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', tone: 'neutral' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'attention' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'info' },
  HANDED_OVER: { label: 'Đã giao cho ĐVVC', tone: 'info' },
  SHIPPING: { label: 'Đang giao', tone: 'info' },
  DELIVERED: { label: 'Giao thành công', tone: 'success' },
  DELIVERY_FAILED: { label: 'Giao thất bại', tone: 'danger' },
  RETURNING: { label: 'Đang hoàn hàng', tone: 'attention' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

export const ORDER_STATUS_ORDER = Object.keys(ORDER_STATUS) as OrderStatus[];

/** Tên thao tác trong nhật ký. Mã chưa có trong bảng hiển thị nguyên mã. */
export const AUDIT_ACTIONS: Record<string, string> = {
  ADMIN_CREATE: 'tạo tài khoản Admin',
  ADMIN_UPDATE: 'sửa thông tin Admin',
  ADMIN_ROLE_CHANGE: 'đổi vai trò Admin',
  ADMIN_DEACTIVATE: 'vô hiệu hóa Admin',
  ADMIN_ACTIVATE: 'kích hoạt lại Admin',
  ADMIN_INVITE_RESEND: 'gửi lại liên kết đặt mật khẩu',
  CONFIG_UPDATE: 'sửa cấu hình',
  SHOWROOM_CREATE: 'thêm cửa hàng',
  SHOWROOM_UPDATE: 'sửa cửa hàng',
  SHOWROOM_DELETE: 'xóa cửa hàng',
  JOB_CREATE: 'đăng vị trí tuyển dụng',
  JOB_UPDATE: 'sửa vị trí tuyển dụng',
  JOB_DELETE: 'xóa vị trí tuyển dụng',
  CUSTOMER_LOCK: 'khóa tài khoản khách',
  CUSTOMER_UNLOCK: 'mở khóa tài khoản khách',
  ORDER_CONFIRM: 'xác nhận đơn',
  ORDER_CANCEL: 'hủy đơn',
  ORDER_STATUS_CHANGE: 'cập nhật trạng thái đơn',
  ORDER_SHIPMENT_UPDATE: 'cập nhật vận chuyển',
  LATE_COMPENSATION_APPROVE: 'duyệt voucher bù giao trễ',
  LATE_COMPENSATION_REJECT: 'từ chối voucher bù giao trễ',
  ORDER_FINALIZE_RETURN: 'hoàn tất hoàn hàng',
  ORDER_RETURN_TO_WAREHOUSE: 'chuyển đơn về kho',
  RETURN_CONFIRMED: 'xác nhận yêu cầu đổi trả',
  CATEGORY_STATUS: 'đổi trạng thái danh mục',
  STOCK_THRESHOLD: 'sửa ngưỡng cảnh báo tồn kho',
  PAYMENT_MANUAL_RESOLVE: 'xác nhận thủ công giao dịch',
  REFUND_COMPLETE: 'ghi nhận hoàn tiền',
  PRODUCT_CREATE: 'tạo sản phẩm',
  PRODUCT_UPDATE: 'sửa sản phẩm',
  PRICE_UPDATE: 'sửa giá',
  STOCK_ADJUST: 'điều chỉnh tồn kho',
  VOUCHER_CREATE: 'tạo voucher',
  PROMOTION_CREATE: 'tạo khuyến mãi',
};

export const AUDIT_TARGETS: Record<string, string> = {
  ADMIN: 'Tài khoản Admin',
  SYSTEM_CONFIG: 'Cấu hình',
  SHOWROOM: 'Cửa hàng',
  JOB: 'Tuyển dụng',
  CUSTOMER: 'Khách hàng',
  ORDER: 'Đơn hàng',
  PAYMENT: 'Thanh toán',
  PRODUCT: 'Sản phẩm',
  PRODUCT_VARIANT: 'Biến thể',
  VOUCHER: 'Voucher',
  PROMOTION: 'Khuyến mãi',
  RETURN_REQUEST: 'Đổi trả',
  WARRANTY_REQUEST: 'Bảo hành',
  LATE_COMPENSATION: 'Voucher bù giao trễ',
  CATEGORY: 'Danh mục',
  VARIANT: 'Biến thể',
  RETURN: 'Đổi trả',
};

/** Module khác có thể ghi `targetType` viết thường (`order`): tra không phân biệt hoa thường. */
export function auditTargetLabel(type: string): string {
  return AUDIT_TARGETS[type.toUpperCase()] ?? type;
}

export const ROLE_SHORT: Record<string, string> = {
  SUPER_ADMIN: 'Cấp cao',
  PRODUCT_ADMIN: 'Product',
  MARKETING_ADMIN: 'Marketing',
  ORDER_ADMIN: 'Order',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action;
}
