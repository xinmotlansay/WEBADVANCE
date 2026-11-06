import { RoleName } from 'shared';
import type { NavIconName } from './nav-icons';

export interface NavItem {
  label: string;
  icon: NavIconName;
  /** Đường dẫn trang; `null` khi trang chưa được làm (mục vẫn hiện nhưng chưa mở được). */
  path: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  [RoleName.SUPER_ADMIN]: 'Admin cấp cao',
  [RoleName.PRODUCT_ADMIN]: 'Product Admin',
  [RoleName.MARKETING_ADMIN]: 'Marketing Admin',
  [RoleName.ORDER_ADMIN]: 'Order Admin',
};

/**
 * Menu theo vai trò, một nguồn duy nhất (admin-ui-rule mục 8, NF-A03). Mục đầu tiên là dashboard của vai trò.
 * Chỉ liệt kê chức năng thuộc quyền; ẩn hẳn mục không có quyền. Kiểm tra quyền thật nằm ở backend.
 */
export const ADMIN_NAV: Record<string, NavItem[]> = {
  [RoleName.SUPER_ADMIN]: [
    { label: 'Tổng quan', icon: 'home', path: '/' },
    { label: 'Sản phẩm & tồn kho', icon: 'box', path: '/san-pham' },
    { label: 'Danh mục', icon: 'layers', path: '/danh-muc' },
    { label: 'Kiểm duyệt đánh giá', icon: 'star', path: '/danh-gia' },
    { label: 'Đơn hàng', icon: 'bag', path: '/admin/orders' },
    { label: 'Thanh toán & đối soát', icon: 'card', path: '/admin/payments' },
    { label: 'Vận chuyển & lịch giao', icon: 'truck', path: '/admin/shipping' },
    { label: 'Đổi trả', icon: 'undo', path: '/admin/returns' },
    { label: 'Bảo hành', icon: 'shield', path: '/admin/warranty' },
    { label: 'Chat CSKH', icon: 'chat', path: '/admin/chat' },
    { label: 'Khách hàng', icon: 'users', path: '/admin/customers' },
    { label: 'Khuyến mãi & voucher', icon: 'tag', path: null },
    { label: 'Banner & nội dung', icon: 'image', path: null },
    { label: 'Collection & cảm hứng', icon: 'file', path: '/marketing/collection' },
    { label: 'Quản lý Admin', icon: 'userCog', path: '/quan-ly-admin' },
    { label: 'Nhật ký & cấu hình', icon: 'log', path: '/nhat-ky-cau-hinh' },
  ],
  [RoleName.PRODUCT_ADMIN]: [
    { label: 'Sản phẩm', icon: 'box', path: '/' },
    { label: 'Thêm sản phẩm', icon: 'plus', path: '/san-pham/them' },
    { label: 'Danh mục & gợi ý phòng', icon: 'layers', path: '/danh-muc' },
    { label: 'Tồn kho', icon: 'bag', path: '/ton-kho' },
    { label: 'Cấp độ vận chuyển', icon: 'truck', path: '/van-chuyen' },
    { label: 'Kiểm duyệt đánh giá', icon: 'star', path: '/danh-gia' },
  ],
  [RoleName.MARKETING_ADMIN]: [
    { label: 'Dashboard marketing', icon: 'home', path: '/' },
    { label: 'Khuyến mãi', icon: 'tag', path: '/marketing/khuyen-mai' },
    { label: 'Mã giảm giá', icon: 'percent', path: '/marketing/ma-giam-gia' },
    { label: 'Banner', icon: 'image', path: '/marketing/banner' },
    { label: 'Nội dung trang chủ', icon: 'layout', path: '/marketing/noi-dung' },
    { label: 'Bài viết & thông báo', icon: 'file', path: '/marketing/bai-viet' },
    { label: 'Collection', icon: 'layers', path: '/marketing/collection' },
    { label: 'Nguồn cảm hứng', icon: 'star', path: '/marketing/nguon-cam-hung' },
    { label: 'Khách hàng rủi ro', icon: 'users', path: '/marketing/khach-hang-rui-ro' },
    { label: 'Báo cáo Marketing', icon: 'chart', path: null },
  ],
  [RoleName.ORDER_ADMIN]: [
    { label: 'Tổng quan & báo cáo', icon: 'home', path: '/admin/dashboard' },
    { label: 'Đơn hàng', icon: 'bag', path: '/admin/orders' },
    { label: 'Thanh toán & đối soát', icon: 'card', path: '/admin/payments' },
    { label: 'Vận chuyển & lịch giao', icon: 'truck', path: '/admin/shipping' },
    { label: 'Giao thất bại', icon: 'alert', path: '/admin/delivery-failed' },
    { label: 'Đổi trả', icon: 'undo', path: '/admin/returns' },
    { label: 'Bảo hành', icon: 'shield', path: '/admin/warranty' },
    { label: 'Chat CSKH', icon: 'chat', path: '/admin/chat' },
    { label: 'Khách hàng (xem)', icon: 'users', path: '/admin/customers' },
  ],
};
