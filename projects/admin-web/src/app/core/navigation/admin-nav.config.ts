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
    { label: 'Danh mục', icon: 'layers', path: null },
    { label: 'Kiểm duyệt đánh giá', icon: 'star', path: null },
    { label: 'Đơn hàng', icon: 'bag', path: null },
    { label: 'Thanh toán & vận chuyển', icon: 'card', path: null },
    { label: 'Đổi trả & bảo hành', icon: 'undo', path: null },
    { label: 'Chat CSKH', icon: 'chat', path: null },
    { label: 'Khách hàng', icon: 'users', path: null },
    { label: 'Khuyến mãi & voucher', icon: 'tag', path: null },
    { label: 'Banner & nội dung', icon: 'image', path: null },
    { label: 'Collection & cảm hứng', icon: 'file', path: null },
    { label: 'Báo cáo', icon: 'chart', path: null },
    { label: 'Quản lý Admin', icon: 'userCog', path: null },
    { label: 'Nhật ký & cấu hình', icon: 'log', path: null },
  ],
  [RoleName.PRODUCT_ADMIN]: [
    { label: 'Sản phẩm', icon: 'box', path: '/' },
    { label: 'Thêm sản phẩm', icon: 'plus', path: '/san-pham/them' },
    { label: 'Danh mục & gợi ý phòng', icon: 'layers', path: null },
    { label: 'Tồn kho', icon: 'bag', path: null },
    { label: 'Cấp độ vận chuyển', icon: 'truck', path: null },
    { label: 'Kiểm duyệt đánh giá', icon: 'star', path: null },
  ],
  [RoleName.MARKETING_ADMIN]: [
    { label: 'Dashboard marketing', icon: 'home', path: '/' },
    { label: 'Khuyến mãi & mã giảm giá', icon: 'tag', path: null },
    { label: 'Banner', icon: 'image', path: null },
    { label: 'Nội dung & bài viết', icon: 'file', path: null },
    { label: 'Collection', icon: 'layers', path: null },
    { label: 'Nguồn cảm hứng', icon: 'star', path: null },
    { label: 'Báo cáo Marketing', icon: 'chart', path: null },
  ],
  [RoleName.ORDER_ADMIN]: [
    { label: 'Dashboard đơn hàng', icon: 'home', path: '/' },
    { label: 'Đơn hàng', icon: 'bag', path: null },
    { label: 'Thanh toán & đối soát', icon: 'card', path: null },
    { label: 'Vận chuyển & lịch giao', icon: 'truck', path: null },
    { label: 'Giao thất bại', icon: 'alert', path: null },
    { label: 'Đổi trả', icon: 'undo', path: null },
    { label: 'Bảo hành', icon: 'shield', path: null },
    { label: 'Chat CSKH', icon: 'chat', path: null },
    { label: 'Khách hàng (xem)', icon: 'users', path: null },
    { label: 'Báo cáo đơn hàng', icon: 'chart', path: null },
  ],
};
