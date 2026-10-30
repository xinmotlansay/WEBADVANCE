import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { AppError } from '../../lib/app-error.js';
import { AuthSource, OtpPurpose, RoleName, UserStatus } from '../../lib/shared-enums.js';
import { OtpModel, RoleModel, UserModel, type IRole, type IUser } from './auth.model.js';
import { computeLockDurationSeconds, normalizeIdentifier } from './auth.rules.js';
import { consumeVerifiedOtp } from './otp.service.js';
import { issueSession, revokeAllSessions } from './token.service.js';

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 3;

export interface AuthUserDto {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  roleName: RoleName;
  mustChangePassword: boolean;
}

export interface AuthResult {
  user: AuthUserDto;
  accessToken: string;
}

export type AuthUserSource = Pick<
  IUser,
  'email' | 'phoneNumber' | 'avatar' | 'profile' | 'security'
> & {
  _id: unknown;
  roleId: IRole;
};

export function mapUser(user: AuthUserSource): AuthUserDto {
  return {
    id: String(user._id),
    fullName: user.profile.fullName,
    email: user.email ?? null,
    phoneNumber: user.phoneNumber ?? null,
    avatar: user.avatar ?? '',
    roleName: user.roleId.name as RoleName,
    mustChangePassword: user.security.mustChangePassword,
  };
}

/** Tài khoản bị admin khóa hoặc đã ẩn danh thì không được đăng nhập / cấp phiên mới. */
export function assertAccountUsable(user: Pick<IUser, 'status' | 'lockInfo'>): void {
  if (user.status === UserStatus.LOCKED) {
    throw new AppError(
      'ACCOUNT_LOCKED_BY_ADMIN',
      403,
      user.lockInfo?.reason || 'Tài khoản đã bị khóa bởi quản trị viên',
    );
  }
  if (user.status === UserStatus.ANONYMIZED) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản đã bị xóa');
  }
}

export async function startSession(user: AuthUserSource, res: Response): Promise<AuthResult> {
  const dto = mapUser(user);
  const accessToken = await issueSession(
    { id: dto.id, roleName: dto.roleName, mustChangePassword: dto.mustChangePassword },
    res,
  );
  return { user: dto, accessToken };
}

export async function ensureCustomerRole(): Promise<IRole> {
  const role = await RoleModel.findOneAndUpdate(
    { name: RoleName.CUSTOMER },
    { $setOnInsert: { name: RoleName.CUSTOMER, description: 'Khách hàng' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!role) {
    throw new AppError('INTERNAL_ERROR', 500, 'Chưa khởi tạo vai trò hệ thống');
  }
  return role;
}

export interface RegisterInput {
  fullName: string;
  dateOfBirth?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  password: string;
  termsAccepted: boolean;
  otpId: string;
}

export async function register(input: RegisterInput, res: Response): Promise<AuthResult> {
  const email = input.email ? normalizeIdentifier(input.email) : null;
  const phoneNumber = input.phoneNumber ? normalizeIdentifier(input.phoneNumber) : null;
  const target = email ?? phoneNumber;
  // Kiểm tra hết trước khi dùng OTP, để lỗi dữ liệu không làm mất mã đã xác thực.
  const pendingOtp = await OtpModel.findById(input.otpId).select('target').lean();
  if (!target || (pendingOtp && target !== pendingOtp.target)) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Email hoặc số điện thoại không khớp với mã xác thực',
    );
  }
  // Hai request song song vẫn lọt qua đây thì unique index chặn, error middleware đổi 11000 → 409.
  if (await UserModel.exists(email ? { email } : { phoneNumber })) {
    throw new AppError(
      email ? 'EMAIL_EXISTS' : 'PHONE_EXISTS',
      409,
      email ? 'Email này đã được sử dụng' : 'Số điện thoại này đã được sử dụng',
    );
  }

  const role = await ensureCustomerRole();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;

  const otp = await consumeVerifiedOtp(input.otpId, OtpPurpose.REGISTER);
  if (otp.target !== target) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Email hoặc số điện thoại không khớp với mã xác thực',
    );
  }

  const user = await UserModel.create({
    roleId: role._id,
    email: email ?? undefined,
    phoneNumber: phoneNumber ?? undefined,
    passwordHash,
    authSource: email ? AuthSource.EMAIL : AuthSource.PHONE,
    profile: {
      fullName: input.fullName,
      dateOfBirth,
      birthDateEditCount: dateOfBirth ? 1 : 0,
    },
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    status: UserStatus.ACTIVE,
  });

  return startSession(
    { ...(user.toObject() as unknown as AuthUserSource), _id: user._id, roleId: role },
    res,
  );
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export async function login(input: LoginInput, res: Response): Promise<AuthResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const query = identifier.includes('@') ? { email: identifier } : { phoneNumber: identifier };

  const user = await UserModel.findOne(query)
    .select('+passwordHash')
    .populate<{ roleId: IRole }>('roleId', 'name');

  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Thông tin đăng nhập không đúng', {
      remainingAttempts: MAX_LOGIN_ATTEMPTS,
    });
  }

  // Tài khoản tạo bằng Google chưa đặt mật khẩu: hướng dẫn dùng Google thay vì báo sai mật khẩu.
  if (!user.passwordHash) {
    throw new AppError(
      'PASSWORD_NOT_SET',
      400,
      'Tài khoản này chưa đặt mật khẩu, vui lòng đăng nhập bằng Google hoặc đặt mật khẩu qua Quên mật khẩu',
    );
  }

  const now = Date.now();
  if (user.security.lockedUntil && user.security.lockedUntil.getTime() > now) {
    const remainingSeconds = Math.ceil((user.security.lockedUntil.getTime() - now) / 1000);
    throw new AppError('ACCOUNT_LOCKED', 423, `Thử lại sau ${remainingSeconds} giây`, {
      lockedUntil: user.security.lockedUntil.toISOString(),
      remainingSeconds,
    });
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    user.security.failedLoginCount += 1;

    if (user.security.failedLoginCount >= MAX_LOGIN_ATTEMPTS) {
      user.security.lockCount += 1;
      const lockSeconds = computeLockDurationSeconds(user.security.lockCount);
      user.security.lockedUntil = new Date(Date.now() + lockSeconds * 1000);
      user.security.failedLoginCount = 0;
      await user.save();

      throw new AppError('ACCOUNT_LOCKED', 423, `Bạn đã nhập sai quá ${MAX_LOGIN_ATTEMPTS} lần`, {
        lockedUntil: user.security.lockedUntil.toISOString(),
        remainingSeconds: lockSeconds,
      });
    }

    await user.save();
    throw new AppError('INVALID_CREDENTIALS', 401, 'Thông tin đăng nhập không đúng', {
      remainingAttempts: MAX_LOGIN_ATTEMPTS - user.security.failedLoginCount,
    });
  }

  // Chỉ báo trạng thái khóa/xóa khi đã đúng mật khẩu, tránh lộ thông tin cho người không có mật khẩu.
  assertAccountUsable(user);

  user.security.failedLoginCount = 0;
  user.security.lockCount = 0;
  user.security.lockedUntil = null;
  await user.save();

  return startSession(user as unknown as AuthUserSource, res);
}

export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await UserModel.findById(userId).populate<{ roleId: IRole }>('roleId', 'name');

  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản không tồn tại');
  }

  return mapUser(user as unknown as AuthUserSource);
}

export async function resetPassword(otpId: string, newPassword: string): Promise<void> {
  const otp = await consumeVerifiedOtp(otpId, OtpPurpose.FORGOT_PASSWORD);

  const query = otp.target.includes('@') ? { email: otp.target } : { phoneNumber: otp.target };
  const user = await UserModel.findOne(query);

  if (!user) {
    throw new AppError('OTP_INVALID', 409, 'Mã xác thực không hợp lệ');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.security.failedLoginCount = 0;
  user.security.lockedUntil = null;

  if (user.status === UserStatus.LOCKED && !user.lockInfo?.lockedBy) {
    user.status = UserStatus.ACTIVE;
  }

  await user.save();
  await revokeAllSessions(String(user._id));
}

const ADMIN_MIN_PASSWORD_LENGTH = 12;

/**
 * API Design 1.6: đổi mật khẩu bằng mật khẩu cũ. Admin cần mật khẩu mới ≥ 12 ký tự và, khi
 * `mustChangePassword`, chỉ cần `newPassword` ở lần đầu. Tài khoản chưa có mật khẩu (đăng ký bằng
 * Google) được đặt luôn mà không cần mật khẩu cũ. Xong thì thu hồi mọi phiên.
 */
export async function changePassword(
  userId: string,
  body: { oldPassword?: string; newPassword: string },
): Promise<void> {
  const user = await UserModel.findById(userId)
    .select('+passwordHash')
    .populate<{ roleId: IRole }>('roleId', 'name');
  if (!user) throw new AppError('UNAUTHORIZED', 401, 'Tài khoản không tồn tại');

  const isAdmin = user.roleId.name !== RoleName.CUSTOMER;
  if (isAdmin && body.newPassword.length < ADMIN_MIN_PASSWORD_LENGTH) {
    throw new AppError('VALIDATION_ERROR', 400, 'Mật khẩu quản trị cần ít nhất 12 ký tự');
  }
  if (user.passwordHash && !user.security.mustChangePassword) {
    const matches = body.oldPassword
      ? await bcrypt.compare(body.oldPassword, user.passwordHash)
      : false;
    if (!matches) throw new AppError('INVALID_CREDENTIALS', 401, 'Mật khẩu hiện tại không đúng');
  }

  user.passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
  user.security.mustChangePassword = false;
  await user.save();
  await revokeAllSessions(userId);
}
