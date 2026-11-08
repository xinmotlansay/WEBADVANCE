import type { QueryFilter, Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import { OrderStatus, RoleName, UserStatus } from '../../lib/shared-enums.js';
import type { AdminCustomer } from '../../lib/shared-types.js';
import { RoleModel, UserModel, type IUser } from '../auth/auth.model.js';
import { OrderModel, toSharedOrderStatus, type OrderDocument } from '../orders/order.model.js';
import { CustomerAddressModel } from './customer.model.js';
import type { CustomerListQuery } from './customer.schema.js';

export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function customerRoleId(): Promise<Types.ObjectId> {
  const role = await RoleModel.findOne({ name: RoleName.CUSTOMER }).select('_id');
  if (!role) throw new AppError('CUSTOMER_ROLE_NOT_FOUND', 500, 'Chưa khởi tạo vai trò khách hàng');
  return role._id;
}

async function toCustomer(
  user: Pick<IUser, 'profile' | 'email' | 'phoneNumber' | 'status'> & { _id: Types.ObjectId },
  includeHistory: boolean,
): Promise<AdminCustomer> {
  const [orders, addresses, stats] = await Promise.all([
    OrderModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5),
    includeHistory
      ? CustomerAddressModel.find({ userId: user._id }).sort({ isDefault: -1, createdAt: -1 })
      : Promise.resolve([]),
    OrderModel.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSpent: {
            $sum: { $cond: [{ $eq: ['$status', OrderStatus.DELIVERED] }, '$totalAmount', 0] },
          },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
    ]),
  ]);
  const orderStats = stats[0] as
    { orderCount: number; totalSpent: number; lastOrderAt?: Date } | undefined;

  return {
    id: String(user._id),
    fullName: user.profile?.fullName ?? '',
    email: user.email ?? null,
    phoneNumber: user.phoneNumber ?? '',
    joinedAt:
      (user as typeof user & { createdAt?: Date }).createdAt?.toISOString() ??
      new Date(0).toISOString(),
    status: user.status === UserStatus.LOCKED ? 'LOCKED' : 'ACTIVE',
    orderCount: orderStats?.orderCount ?? 0,
    totalSpent: orderStats?.totalSpent ?? 0,
    lastOrderAt: orderStats?.lastOrderAt?.toISOString() ?? null,
    addresses: addresses.map((address) => ({
      recipientName: address.recipientName,
      phone: address.phone,
      addressLine: address.addressLine,
      ward: address.ward,
      district: address.district,
      province: address.province,
      isDefault: address.isDefault,
    })),
    recentOrders: (includeHistory ? orders : []).map((order) => ({
      id: String(order._id),
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      status: toSharedOrderStatus(order.status),
      createdAt: order.createdAt.toISOString(),
    })),
  };
}

export async function listCustomers(query: CustomerListQuery): Promise<PageResult<AdminCustomer>> {
  const roleId = await customerRoleId();
  const filter: QueryFilter<IUser> = { roleId, anonymizedAt: null };
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ 'profile.fullName': regex }, { email: regex }, { phoneNumber: regex }];
  }
  const page = query.page;
  const limit = query.limit;
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    UserModel.countDocuments(filter),
  ]);
  return {
    data: await Promise.all(users.map((user) => toCustomer(user, false))),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getCustomer(id: string): Promise<AdminCustomer> {
  const roleId = await customerRoleId();
  const user = await UserModel.findOne({ _id: id, roleId, anonymizedAt: null });
  if (!user) throw new AppError('CUSTOMER_NOT_FOUND', 404, 'Không tìm thấy khách hàng');
  return toCustomer(user, true);
}
