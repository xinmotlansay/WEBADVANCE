import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { AuthSource, RoleName, UserStatus } from '../src/lib/shared-enums.js';
import { logger } from '../src/lib/logger.js';
import { RoleModel, UserModel } from '../src/modules/auth/auth.model.js';

/**
 * Tài khoản Admin để test đăng nhập (AD-01). Chỉ dùng khi phát triển.
 * Chạy: npm run seed:admin (tạo mới, hoặc đặt lại mật khẩu và mở khóa nếu đã có).
 */
const TEST_ADMINS = [
  {
    email: 'admin@caraveso.vn',
    password: 'caraveso-admin-2026',
    fullName: 'Quản trị viên',
    /** Ảnh nằm ở uploads/avatars/ (được server phục vụ ở /uploads, không đưa lên git). */
    avatar: '/uploads/avatars/admin.jpg',
    roleName: RoleName.SUPER_ADMIN,
  },
  {
    email: 'product@caraveso.vn',
    password: 'caraveso-product-2026',
    fullName: 'Phạm Lan',
    avatar: '',
    roleName: RoleName.PRODUCT_ADMIN,
  },
  {
    email: 'marketing@caraveso.vn',
    password: 'caraveso-marketing-2026',
    fullName: 'Hà Marketing',
    avatar: '',
    roleName: RoleName.MARKETING_ADMIN,
  },
  {
    email: 'order@caraveso.vn',
    password: 'caraveso-order-2026',
    fullName: 'Minh Order',
    avatar: '',
    roleName: RoleName.ORDER_ADMIN,
  },
];

async function seedAdminAccounts(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Không chạy seed tài khoản test ở production');
  }

  await mongoose.connect(config.mongodbUri);

  for (const account of TEST_ADMINS) {
    const role = await RoleModel.findOneAndUpdate(
      { name: account.roleName },
      { $setOnInsert: { name: account.roleName, description: account.roleName } },
      { upsert: true, new: true },
    );

    const passwordHash = await bcrypt.hash(account.password, 12);
    await UserModel.updateOne(
      { email: account.email },
      {
        $set: {
          roleId: role!._id,
          passwordHash,
          authSource: AuthSource.EMAIL,
          'profile.fullName': account.fullName,
          avatar: account.avatar,
          status: UserStatus.ACTIVE,
          'security.failedLoginCount': 0,
          'security.lockCount': 0,
          'security.lockedUntil': null,
          'security.mustChangePassword': false,
        },
        $setOnInsert: { email: account.email },
      },
      { upsert: true },
    );

    logger.info({ email: account.email, role: account.roleName }, 'Đã tạo/cập nhật tài khoản admin test');
  }

  await mongoose.disconnect();
}

seedAdminAccounts().catch((error) => {
  logger.error({ err: error }, 'Seed tài khoản admin thất bại');
  process.exit(1);
});
