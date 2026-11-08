import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { RoleName } from '../src/lib/shared-enums.js';
import { logger } from '../src/lib/logger.js';
import { RoleModel } from '../src/modules/auth/auth.model.js';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  [RoleName.CUSTOMER]: 'Khách hàng',
  [RoleName.SUPER_ADMIN]: 'Quản trị viên cấp cao',
  [RoleName.PRODUCT_ADMIN]: 'Quản trị sản phẩm',
  [RoleName.MARKETING_ADMIN]: 'Quản trị marketing',
  [RoleName.ORDER_ADMIN]: 'Quản trị đơn hàng',
};

async function seedRoles(): Promise<void> {
  await mongoose.connect(config.mongodbUri);

  for (const name of Object.values(RoleName)) {
    await RoleModel.updateOne(
      { name },
      { $setOnInsert: { name, description: ROLE_DESCRIPTIONS[name] ?? '' } },
      { upsert: true },
    );
    logger.info({ role: name }, 'Đã tạo vai trò');
  }

  await mongoose.disconnect();
}

seedRoles().catch((error) => {
  logger.error({ err: error }, 'Seed vai trò thất bại');
  process.exit(1);
});
