import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { AppError } from '../../utils/app-error.js';
import { AuthSessionModel, RoleModel, UserModel, type UserDoc } from './auth.model.js';
import type { Types } from 'mongoose';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
export async function customer(userId: Types.ObjectId) {
  const user = await UserModel.findById(userId).lean();
  if (!user || user.status !== 'ACTIVE')
    throw new AppError('UNAUTHORIZED', 401, 'Phiên đăng nhập không còn hiệu lực');
  const role = await RoleModel.findById(user.roleId).lean();
  if (role?.name !== 'CUSTOMER')
    throw new AppError('FORBIDDEN', 403, 'Chức năng dành cho khách hàng');
  return user;
}
function publicUser(user: UserDoc) {
  return {
    id: user._id.toString(),
    fullName: user.profile.fullName,
    email: user.email,
    avatar: user.avatar ?? '',
    roleName: 'CUSTOMER',
    mustChangePassword: false,
  };
}
function token(user: UserDoc, sid: string) {
  if (config.jwtSecret.length < 32)
    throw new AppError('AUTH_UNAVAILABLE', 503, 'Máy chủ chưa cấu hình khóa xác thực');
  return {
    user: publicUser(user),
    accessToken: jwt.sign({ sid }, config.jwtSecret, {
      subject: user._id.toString(),
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'caraveso',
      audience: 'customer-web',
    }),
  };
}
export async function login(identifier: string, password: string) {
  const user = await UserModel.findOne({
    $or: [{ email: identifier.toLowerCase() }, { phoneNumber: identifier }],
  })
    .select('+passwordHash')
    .lean();
  if (user?.security?.lockedUntil && user.security.lockedUntil.getTime() > Date.now())
    throw new AppError('ACCOUNT_LOCKED', 423, 'Tài khoản tạm khóa. Vui lòng thử lại sau.', {
      lockedUntil: user.security.lockedUntil,
    });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    if (user) {
      const result = await UserModel.findOneAndUpdate(
        { _id: user._id },
        { $inc: { 'security.failedLoginCount': 1 } },
        { new: true },
      ).lean();
      if ((result?.security?.failedLoginCount ?? 0) >= 3) {
        const lockCount = result?.security?.lockCount ?? 0;
        await UserModel.updateOne(
          { _id: user._id },
          {
            $set: {
              'security.failedLoginCount': 0,
              'security.lockedUntil': new Date(
                Date.now() + Math.min(60 * 2 ** lockCount, 3600) * 1000,
              ),
            },
            $inc: { 'security.lockCount': 1 },
          },
        );
      }
    }
    throw new AppError('INVALID_CREDENTIALS', 401, 'Email/số điện thoại hoặc mật khẩu không đúng');
  }
  await customer(user._id);
  const sid = randomUUID(),
    refreshToken = `${sid}.${randomBytes(32).toString('hex')}`;
  const data = token(user, sid);
  await AuthSessionModel.create({
    _id: sid,
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        'security.failedLoginCount': 0,
        'security.lockCount': 0,
        'security.lockedUntil': null,
      },
    },
  );
  return { data, refreshToken };
}
export async function refresh(oldToken: string) {
  const sid = oldToken.split('.')[0];
  const session = await AuthSessionModel.findOne({
    _id: sid,
    tokenHash: hashToken(oldToken),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw new AppError('UNAUTHORIZED', 401, 'Vui lòng đăng nhập lại');
  const user = await customer(session.userId);
  const refreshToken = `${sid}.${randomBytes(32).toString('hex')}`;
  const updated = await AuthSessionModel.updateOne(
    { _id: sid, tokenHash: hashToken(oldToken) },
    { $set: { tokenHash: hashToken(refreshToken) } },
  );
  if (!updated.modifiedCount) throw new AppError('UNAUTHORIZED', 401, 'Phiên đã được làm mới');
  return { data: token(user, sid), refreshToken };
}
