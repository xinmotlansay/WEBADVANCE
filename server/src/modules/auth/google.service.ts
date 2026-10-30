import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { AuthSource, OtpChannel, OtpPurpose, UserStatus } from '../../lib/shared-enums.js';
import { config } from '../../config/index.js';
import { verifyFirebaseIdToken, type GoogleProfile } from '../../integrations/google.js';
import {
  assertAccountUsable,
  ensureCustomerRole,
  startSession,
  type AuthResult,
  type AuthUserSource,
} from './auth.service.js';
import { UserModel, type IRole } from './auth.model.js';
import { consumeVerifiedOtp, sendOtp } from './otp.service.js';

const LINK_TOKEN_AUDIENCE = 'google-link';
const LINK_TOKEN_TTL = '15m';

interface GoogleLinkTokenPayload extends GoogleProfile {
  purpose: 'GOOGLE_LINK';
}

function signLinkToken(profile: GoogleProfile): string {
  const payload: GoogleLinkTokenPayload = { ...profile, purpose: 'GOOGLE_LINK' };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: LINK_TOKEN_TTL,
    audience: LINK_TOKEN_AUDIENCE,
  });
}

function verifyLinkToken(token: string): GoogleLinkTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      audience: LINK_TOKEN_AUDIENCE,
    }) as Partial<GoogleLinkTokenPayload>;

    if (
      decoded.purpose !== 'GOOGLE_LINK' ||
      !decoded.googleId ||
      !decoded.email
    ) {
      throw new Error('Payload không hợp lệ');
    }

    return {
      purpose: 'GOOGLE_LINK',
      googleId: decoded.googleId,
      email: decoded.email.toLowerCase(),
      fullName: decoded.fullName ?? 'Khách hàng',
      avatar: decoded.avatar ?? '',
    };
  } catch (error) {
    logger.warn({ err: error }, 'Link token Google không hợp lệ');
    throw new AppError(
      'GOOGLE_LINK_TOKEN_INVALID',
      401,
      'Phiên liên kết đã hết hạn, vui lòng bấm đăng nhập Google lại',
    );
  }
}

/**
 * Đăng nhập / đăng ký nhanh bằng Google.
 * - Đã liên kết googleId: đăng nhập.
 * - Email chưa có tài khoản: tạo mới (không cần OTP) với role CUSTOMER.
 * - Email đã có tài khoản nhưng chưa liên kết: trả 409 kèm linkToken để xác minh quyền sở hữu.
 */
export async function loginWithGoogle(idToken: string, res: Response): Promise<AuthResult> {
  const profile = await verifyFirebaseIdToken(idToken);

  const linked = await UserModel.findOne({ googleId: profile.googleId }).populate<{ roleId: IRole }>(
    'roleId',
    'name',
  );

  if (linked) {
    assertAccountUsable(linked);
    return startSession(linked as unknown as AuthUserSource, res);
  }

  const existing = await UserModel.findOne({ email: profile.email })
    .select('+passwordHash')
    .populate<{ roleId: IRole }>('roleId', 'name');

  if (existing) {
    assertAccountUsable(existing);

    const verifyMethods: Array<'PASSWORD' | 'OTP_EMAIL'> = [];
    if (existing.passwordHash) {
      verifyMethods.push('PASSWORD');
    }
    verifyMethods.push('OTP_EMAIL');

    throw new AppError(
      'GOOGLE_EMAIL_EXISTS',
      409,
      'Email này đã có tài khoản CaraVeso. Vui lòng xác minh để liên kết với Google.',
      {
        linkToken: signLinkToken(profile),
        verifyMethods,
        email: profile.email,
      },
    );
  }

  const role = await ensureCustomerRole();
  const user = await UserModel.create({
    roleId: role._id,
    email: profile.email,
    googleId: profile.googleId,
    authSource: AuthSource.GOOGLE,
    profile: { fullName: profile.fullName, dateOfBirth: null, birthDateEditCount: 0 },
    avatar: profile.avatar,
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    status: UserStatus.ACTIVE,
  });

  logger.info({ userId: String(user._id) }, 'Tạo tài khoản mới bằng Google');

  return startSession(
    { ...(user.toObject() as unknown as AuthUserSource), _id: user._id, roleId: role },
    res,
  );
}

/** Gửi OTP tới email của tài khoản cần liên kết (không tiết lộ qua endpoint công khai). */
export async function requestGoogleLinkOtp(linkToken: string): Promise<{
  otpId: string;
  expiresAt: string;
  resendAvailableAt: string;
  email: string;
}> {
  const payload = verifyLinkToken(linkToken);

  const user = await UserModel.findOne({ email: payload.email });
  if (!user) {
    throw new AppError(
      'GOOGLE_LINK_TOKEN_INVALID',
      401,
      'Phiên liên kết đã hết hạn, vui lòng bấm đăng nhập Google lại',
    );
  }

  if (user.googleId) {
    throw new AppError('GOOGLE_ALREADY_LINKED', 409, 'Tài khoản này đã liên kết với Google');
  }

  const result = await sendOtp(
    {
      purpose: OtpPurpose.LINK_GOOGLE,
      channel: OtpChannel.EMAIL,
      target: payload.email,
      userId: String(user._id),
    },
    { internal: true },
  );

  return {
    otpId: result.otpId,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    email: payload.email,
  };
}

export interface GoogleLinkInput {
  linkToken: string;
  password?: string;
  otpId?: string;
}

/** Liên kết Google vào tài khoản đã tồn tại sau khi xác minh quyền sở hữu. */
export async function linkGoogle(input: GoogleLinkInput, res: Response): Promise<AuthResult> {
  const payload = verifyLinkToken(input.linkToken);

  const user = await UserModel.findOne({ email: payload.email })
    .select('+passwordHash')
    .populate<{ roleId: IRole }>('roleId', 'name');

  if (!user) {
    throw new AppError(
      'GOOGLE_LINK_TOKEN_INVALID',
      401,
      'Phiên liên kết đã hết hạn, vui lòng bấm đăng nhập Google lại',
    );
  }

  assertAccountUsable(user);

  if (user.googleId) {
    if (user.googleId === payload.googleId) {
      return startSession(
        user as unknown as AuthUserSource,
        res,
      );
    }
    throw new AppError(
      'GOOGLE_ALREADY_LINKED',
      409,
      'Tài khoản này đã liên kết với một tài khoản Google khác',
    );
  }

  if (input.password) {
    if (!user.passwordHash) {
      throw new AppError(
        'PASSWORD_NOT_SET',
        400,
        'Tài khoản này chưa có mật khẩu, vui lòng xác minh bằng mã gửi tới email',
      );
    }
    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Mật khẩu không đúng');
    }
  } else if (input.otpId) {
    const otp = await consumeVerifiedOtp(input.otpId, OtpPurpose.LINK_GOOGLE);
    if (otp.target !== payload.email) {
      throw new AppError('OTP_INVALID', 409, 'Mã xác thực không đúng');
    }
  } else {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Vui lòng xác minh bằng mật khẩu hoặc mã xác thực gửi tới email',
    );
  }

  user.googleId = payload.googleId;
  if (!user.avatar && payload.avatar) {
    user.avatar = payload.avatar;
  }
  await user.save();

  logger.info({ userId: String(user._id) }, 'Đã liên kết tài khoản Google');

  return startSession(
    user as unknown as AuthUserSource,
    res,
  );
}
