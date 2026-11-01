import { RoleName } from 'shared';

export interface AdminNavItem {
  label: string;
  icon: string;
  route: string;
  roles: RoleName[];
  group?: string;
}

export const ORDER_ADMIN_ROLES: RoleName[] = [RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN];

/** Cấu hình menu duy nhất theo vai trò — không viết tay menu ở từng trang. */
export const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Tổng quan đơn hàng',
    icon: 'layout-dashboard',
    route: '/admin/dashboard',
    roles: ORDER_ADMIN_ROLES,
    group: 'Vận hành',
  },
  {
    label: 'Đơn hàng',
    icon: 'shopping-bag',
    route: '/admin/orders',
    roles: ORDER_ADMIN_ROLES,
    group: 'Vận hành',
  },
  {
    label: 'Vận chuyển & lịch giao',
    icon: 'truck',
    route: '/admin/shipping',
    roles: ORDER_ADMIN_ROLES,
    group: 'Vận hành',
  },
  {
    label: 'Giao thất bại',
    icon: 'package-x',
    route: '/admin/delivery-failed',
    roles: ORDER_ADMIN_ROLES,
    group: 'Vận hành',
  },
  {
    label: 'Thanh toán & đối soát',
    icon: 'credit-card',
    route: '/admin/payments',
    roles: ORDER_ADMIN_ROLES,
    group: 'Tài chính',
  },
  {
    label: 'Đổi trả',
    icon: 'rotate-ccw',
    route: '/admin/returns',
    roles: ORDER_ADMIN_ROLES,
    group: 'Tài chính',
  },
  {
    label: 'Bảo hành',
    icon: 'shield-check',
    route: '/admin/warranty',
    roles: ORDER_ADMIN_ROLES,
    group: 'Tài chính',
  },
  {
    label: 'Chat CSKH',
    icon: 'message-square',
    route: '/admin/chat',
    roles: ORDER_ADMIN_ROLES,
    group: 'Hỗ trợ & Khách hàng',
  },
  {
    label: 'Khách hàng',
    icon: 'users',
    route: '/admin/customers',
    roles: ORDER_ADMIN_ROLES,
    group: 'Hỗ trợ & Khách hàng',
  },
  {
    label: 'Báo cáo đơn hàng',
    icon: 'bar-chart-3',
    route: '/admin/reports/orders',
    roles: ORDER_ADMIN_ROLES,
    group: 'Hỗ trợ & Khách hàng',
  },
];

export function navForRole(role: RoleName | null | undefined): AdminNavItem[] {
  if (!role) return [];
  return ADMIN_NAV.filter((item) => item.roles.includes(role));
}
