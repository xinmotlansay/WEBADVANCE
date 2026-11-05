import { RoleName } from '../../lib/shared-enums.js';

export type AccessLevel = 'FULL' | 'VIEW' | 'NONE';

export interface PermissionGroup {
  key: string;
  label: string;
  access: Record<string, AccessLevel>;
}

const SA = RoleName.SUPER_ADMIN;
const PA = RoleName.PRODUCT_ADMIN;
const MA = RoleName.MARKETING_ADMIN;
const OA = RoleName.ORDER_ADMIN;

function access(full: RoleName[], view: RoleName[] = []): Record<string, AccessLevel> {
  return Object.fromEntries(
    [SA, PA, MA, OA].map((role) => [role, full.includes(role) ? 'FULL' : view.includes(role) ? 'VIEW' : 'NONE']),
  );
}

/**
 * Ma trận phân quyền cố định (Requirements mục 5, AD-13, AD-14). Không chỉnh sửa động: muốn đổi phải
 * sửa tài liệu và code cùng lúc. Middleware `requireRole` ở từng route là nơi kiểm tra quyền thật.
 */
export const PERMISSION_MATRIX: PermissionGroup[] = [
  { key: 'catalog', label: 'Sản phẩm, danh mục, tồn kho', access: access([SA, PA]) },
  { key: 'reviews', label: 'Kiểm duyệt đánh giá', access: access([SA, PA]) },
  { key: 'roomRules', label: 'Quy tắc gợi ý, cấp độ vận chuyển', access: access([SA, PA]) },
  { key: 'orders', label: 'Đơn hàng, thanh toán, vận chuyển', access: access([SA, OA]) },
  { key: 'afterSales', label: 'Đổi trả, bảo hành, hoàn tiền', access: access([SA, OA]) },
  { key: 'chat', label: 'Chat CSKH', access: access([SA, OA]) },
  { key: 'customers', label: 'Thông tin khách hàng', access: access([SA], [OA]) },
  { key: 'customerLock', label: 'Khóa/mở tài khoản khách', access: access([SA]) },
  { key: 'marketing', label: 'Khuyến mãi, voucher, banner, nội dung', access: access([SA, MA]) },
  { key: 'collections', label: 'Collection, Nguồn cảm hứng', access: access([SA, MA]) },
  { key: 'marketingReports', label: 'Báo cáo marketing, doanh thu theo chương trình', access: access([SA], [MA]) },
  { key: 'admins', label: 'Quản lý Admin và gán vai trò', access: access([SA]) },
  { key: 'system', label: 'Cấu hình hệ thống, nhật ký hoạt động', access: access([SA]) },
];

export const ROLE_DASHBOARDS: Record<string, string> = {
  [SA]: 'Tổng quan',
  [PA]: 'Sản phẩm',
  [MA]: 'Marketing',
  [OA]: 'Đơn hàng',
};
