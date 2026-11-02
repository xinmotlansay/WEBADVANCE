import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../server/src/config/index.js';
import { UserModel, RoleModel } from '../server/src/modules/auth/auth.model.js';
import { RoleName, UserStatus } from '../server/src/lib/shared-enums.js';

async function resetPassword() {
  const newPassword = process.argv[2] || 'Caraveso@2026';
  const email = process.argv[3] || 'order@caraveso.vn';

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(config.mongodbUri);

  const role = await RoleModel.findOne({ name: RoleName.ORDER_ADMIN });
  if (!role) {
    console.error(`Không tìm thấy role ${RoleName.ORDER_ADMIN}`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        passwordHash,
        roleId: role._id,
        status: UserStatus.ACTIVE,
        'security.failedLoginCount': 0,
        'security.lockCount': 0,
        'security.lockedUntil': null,
      },
    },
    { new: true }
  );

  if (!user) {
    console.error(`Không tìm thấy user với email ${email}`);
  } else {
    console.log(`\n========================================`);
    console.log(` ĐÃ CẬP NHẬT THÀNH CÔNG TÀI KHOẢN ADMIN:`);
    console.log(` Email:    ${email}`);
    console.log(` Password: ${newPassword}`);
    console.log(` Role:     ORDER_ADMIN (${role._id})`);
    console.log(` Status:   ACTIVE (đã mở khóa security)`);
    console.log(`========================================\n`);
  }

  await mongoose.disconnect();
}

resetPassword().catch(console.error);

