import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { AuthSource, RoleName, UserStatus } from '../src/lib/shared-enums.js';
import { logger } from '../src/lib/logger.js';
import { RoleModel, UserModel } from '../src/modules/auth/auth.model.js';

/**
 * Tạo đúng một tài khoản SUPER_ADMIN thật (dùng cho production).
 * Không tạo tài khoản test, không ghi đè tài khoản đã có.
 *
 * Chạy một lần, truyền thông tin qua biến môi trường (không ghi mật khẩu vào file):
 *   MONGODB_URI="mongodb+srv://..." \
 *   SUPER_ADMIN_EMAIL="ban@domain.com" \
 *   SUPER_ADMIN_PASSWORD="mat-khau-it-nhat-12-ky-tu" \
 *   SUPER_ADMIN_NAME="Ten cua ban" \
 *   npx tsx server/seed/create-super-admin.ts
 */
async function createSuperAdmin(): Promise<void> {
  const mongodbUri = process.env['MONGODB_URI'] ?? '';
  const email = (process.env['SUPER_ADMIN_EMAIL'] ?? '').trim().toLowerCase();
  const password = process.env['SUPER_ADMIN_PASSWORD'] ?? '';
  const fullName = (process.env['SUPER_ADMIN_NAME'] ?? 'Quản trị viên cấp cao').trim();

  if (!mongodbUri) throw new Error('Thiếu MONGODB_URI');
  if (!email || !email.includes('@')) throw new Error('SUPER_ADMIN_EMAIL không hợp lệ');
  if (password.length < 12) throw new Error('SUPER_ADMIN_PASSWORD phải có ít nhất 12 ký tự');

  await mongoose.connect(mongodbUri);

  try {
    const existing = await UserModel.exists({ email });
    if (existing) {
      throw new Error(`Đã có tài khoản ${email}. Script không ghi đè tài khoản có sẵn.`);
    }

    const role = await RoleModel.findOneAndUpdate(
      { name: RoleName.SUPER_ADMIN },
      { $setOnInsert: { name: RoleName.SUPER_ADMIN, description: 'Quản trị viên cấp cao' } },
      { upsert: true, new: true },
    );

    const passwordHash = await bcrypt.hash(password, 12);
    await UserModel.create({
      email,
      roleId: role!._id,
      passwordHash,
      authSource: AuthSource.EMAIL,
      profile: { fullName },
      avatar: '',
      status: UserStatus.ACTIVE,
      security: {
        failedLoginCount: 0,
        lockCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
      },
    });

    logger.info({ email, role: RoleName.SUPER_ADMIN }, 'Đã tạo tài khoản SUPER_ADMIN');
  } finally {
    await mongoose.disconnect();
  }
}

createSuperAdmin().catch((error: unknown) => {
  logger.error({ err: error }, 'Tạo SUPER_ADMIN thất bại');
  process.exit(1);
});
