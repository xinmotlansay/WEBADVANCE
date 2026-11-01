import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { AuthSource, RoleName, UserStatus } from '../src/lib/shared-enums.js';
import { logger } from '../src/lib/logger.js';
import { RoleModel, UserModel } from '../src/modules/auth/auth.model.js';

const ADMIN_EMAIL = 'caraveso@gmail.com';

async function seedOrderAdminUser(): Promise<void> {
  const password = process.env.ORDER_ADMIN_SEED_PASSWORD;
  if (
    !password ||
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'Đặt ORDER_ADMIN_SEED_PASSWORD có ít nhất 12 ký tự, gồm chữ thường, chữ hoa và chữ số.',
    );
  }

  await mongoose.connect(config.MONGODB_URI);

  const role = await RoleModel.findOneAndUpdate(
    { name: RoleName.ORDER_ADMIN },
    { $setOnInsert: { name: RoleName.ORDER_ADMIN, description: 'Quản trị đơn hàng' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  const existingUser = await UserModel.findOne({ email: ADMIN_EMAIL });
  let roleId = role._id;

  if (existingUser) {
    const existingRole = await RoleModel.findById(existingUser.roleId);
    if (
      existingRole?.name !== RoleName.ORDER_ADMIN &&
      existingRole?.name !== RoleName.SUPER_ADMIN
    ) {
      throw new Error(
        `Tài khoản ${ADMIN_EMAIL} đã tồn tại với vai trò không phải admin; không thay đổi tài khoản này.`,
      );
    }
    roleId = existingUser.roleId;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await UserModel.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        roleId,
        email: ADMIN_EMAIL,
        passwordHash,
        authSource: AuthSource.EMAIL,
        profile: { fullName: 'CaraVeso Admin', dateOfBirth: null, birthDateEditCount: 0 },
        avatar: '',
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        status: UserStatus.ACTIVE,
        security: {
          failedLoginCount: 0,
          lockCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
        },
        lockInfo: { reason: null, lockedBy: null, lockedAt: null },
      },
      $unset: { googleId: '' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!user) {
    throw new Error('Không tạo được tài khoản Order Admin.');
  }
  logger.info({ email: ADMIN_EMAIL }, 'Đã tạo/cập nhật tài khoản Order Admin');
}

seedOrderAdminUser()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Seed tài khoản Order Admin thất bại');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
