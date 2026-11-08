import type { PageMeta, RoleName } from 'shared';

export type OverviewRange = 'today' | '7d' | '30d' | 'month';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'HANDED_OVER'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNING'
  | 'CANCELLED';

export interface RankedItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface RecentOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  customerName: string;
  address: string;
  deliveredBy: 'TEAM' | 'CARRIER' | null;
  carrierName: string | null;
  paymentMethod: 'COD' | 'BANK_TRANSFER';
  collectionType: 'FULL' | 'DEPOSIT';
  items: { name: string; quantity: number; amount: number }[];
}

export interface ActivityItem {
  id: string;
  actorName: string;
  roleName: RoleName | null;
  action: string;
  targetType: string;
  targetId: string;
  performedAt: string;
}

/** `GET /admin/dashboard/overview` (API Design 11b.5). */
export interface Overview {
  range: OverviewRange;
  period: { from: string; to: string };
  revenue: {
    today: number;
    last7d: number;
    last30d: number;
    selected: number;
    selectedChangePercent: number | null;
    byMonth: { month: number; year: number; revenue: number }[];
  };
  ordersToday: { count: number; changePercent: number | null };
  ordersByStatus: Record<OrderStatus, number>;
  averageOrderValue: number;
  averageOrderValueChangePercent: number | null;
  cancelRate: number;
  cancelRateChangePoints: number;
  returnRate: number;
  returnRateChangePoints: number;
  topProducts: RankedItem[];
  topCategories: RankedItem[];
  newVsReturningCustomers: { new: number; returning: number };
  overdueConfirmationCount: number;
  overdueConfirmation: {
    thresholdHours: number;
    count: number;
    items: { id: string; orderCode: string; waitingMinutes: number }[];
  };
  recentOrders: RecentOrder[];
  recentAdminActivity: ActivityItem[];
  generatedAt: string;
}

export interface AdminAccount {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  roleName: RoleName;
  status: 'ACTIVE' | 'LOCKED';
  pendingInvite: boolean;
  lockInfo: { reason: string | null; lockedAt: string | null } | null;
  createdAt: string;
}

export interface AdminListResponse {
  data: AdminAccount[];
  meta: PageMeta;
  summary: { byRole: Record<string, { active: number; locked: number }>; pendingInvites: number };
}

export interface AdminListQuery {
  q?: string;
  roleName?: RoleName | '';
  status?: 'ACTIVE' | 'LOCKED' | '';
  page: number;
  limit: number;
}

export interface CreateAdminBody {
  email: string;
  fullName: string;
  roleName: RoleName;
  phoneNumber?: string;
}

export type AccessLevel = 'FULL' | 'VIEW' | 'NONE';

export interface RolesResponse {
  roles: { name: RoleName; description: string; dashboard: string; activeAdminCount: number }[];
  matrix: { key: string; label: string; access: Record<string, AccessLevel> }[];
}

export interface AuditLog {
  id: string;
  actor: { id: string; fullName: string; roleName: RoleName | null } | null;
  action: string;
  targetType: string;
  targetId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string;
  performedAt: string;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export type ConfigFieldType = 'text' | 'textarea' | 'email' | 'number' | 'money' | 'percent' | 'boolean' | 'time' | 'date' | 'weekdays';

export interface ConfigField {
  path: string;
  label: string;
  type: ConfigFieldType;
  unit?: string;
  hint?: string;
  section?: string;
}

export interface ConfigItem {
  key: string;
  label: string;
  description: string;
  subgroup: string | null;
  fields: ConfigField[];
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface ConfigGroup {
  key: string;
  label: string;
  description: string;
  items: ConfigItem[];
}

export type ShowroomRegion = 'NORTH' | 'CENTRAL' | 'SOUTH';

/** Cửa hàng hiển thị ở bản đồ và trang Hệ thống showroom bên website khách. */
export interface AdminShowroom {
  id: string;
  name: string;
  slug: string;
  city: string;
  region: ShowroomRegion;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  latitude: number;
  longitude: number;
  image: string;
  isFlagship: boolean;
  displayOrder: number;
  status: 'VISIBLE' | 'HIDDEN';
}

export type ShowroomInput = Omit<AdminShowroom, 'id' | 'slug'>;

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'INTERN';
export type JobLevel = 'INTERN' | 'JUNIOR' | 'SENIOR' | 'MANAGER';
export type JobStatus = 'OPEN' | 'CLOSED' | 'HIDDEN';

/** Vị trí tuyển dụng hiển thị ở trang Tuyển dụng của website khách. */
export interface AdminJob {
  id: string;
  title: string;
  slug: string;
  department: string;
  city: string;
  type: JobType;
  level: JobLevel;
  salary: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  quantity: number;
  /** yyyy-MM-dd hoặc null khi không giới hạn. */
  deadline: string | null;
  displayOrder: number;
  status: JobStatus;
  postedAt: string | null;
}

export type JobInput = Omit<AdminJob, 'id' | 'slug' | 'postedAt'>;
