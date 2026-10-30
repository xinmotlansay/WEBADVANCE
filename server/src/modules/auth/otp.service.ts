import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { OtpChannel, OtpPurpose } from '../../lib/shared-enums.js';
import { sendOtpEmail } from '../../integrations/resend.js';
import { OtpModel, UserModel } from './auth.model.js';
import { canResendOtp, normalizePhone, OTP_RESEND_INTERVAL_SECONDS } from './auth.rules.js';

const OTP_TTL_SECONDS = 5 * 60;
const VERIFIED_OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

export interface SendOtpInput {
  purpose: OtpPurpose;
  channel: OtpChannel;
  target: string;
  userId?: string | null;
}

export interface SendOtpResult {
  otpId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Mã OTP, chỉ có ngoài production để giả lập SMS (controller chỉ trả ra cho kênh PHONE). */
  devCode?: string;
}

const PUBLIC_PURPOSES: OtpPurpose[] = [OtpPurpose.REGISTER, OtpPurpose.FORGOT_PASSWORD];
/** Cần đăng nhập: `userId` lấy từ token (API Design 1.1). */
export const ACCOUNT_PURPOSES: OtpPurpose[] = [
  OtpPurpose.CHANGE_CONTACT,
  OtpPurpose.DELETE_ACCOUNT,
];

export function normalizeTarget(channel: OtpChannel, target: string): string {
  const trimmed = target.trim();
  if (channel === OtpChannel.EMAIL) {
    return trimmed.toLowerCase();
  }
  return normalizePhone(trimmed);
}

export async function sendOtp(
  input: SendOtpInput,
  options: { internal?: boolean } = {},
): Promise<SendOtpResult> {
  if (
    !options.internal &&
    !PUBLIC_PURPOSES.includes(input.purpose) &&
    !ACCOUNT_PURPOSES.includes(input.purpose)
  ) {
    throw new AppError('FORBIDDEN', 403, 'Mục đích xác thực không hợp lệ');
  }

  const target = normalizeTarget(input.channel, input.target);
  const now = new Date();

  const existingUser = await UserModel.findOne(
    input.channel === OtpChannel.EMAIL ? { email: target } : { phoneNumber: target },
  );

  // Chống dò tài khoản: quên mật khẩu luôn trả 200 dù email/sđt không tồn tại.
  if (input.purpose === OtpPurpose.FORGOT_PASSWORD && !existingUser) {
    logger.debug({ target }, 'Yêu cầu quên mật khẩu cho tài khoản không tồn tại');
    return {
      otpId: new Types.ObjectId().toString(),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + OTP_RESEND_INTERVAL_SECONDS * 1000).toISOString(),
    };
  }

  if (ACCOUNT_PURPOSES.includes(input.purpose)) {
    const owner = input.userId ? await UserModel.findById(input.userId).lean() : null;
    if (!owner) throw new AppError('UNAUTHORIZED', 401, 'Bạn chưa đăng nhập');
    if (
      input.purpose === OtpPurpose.CHANGE_CONTACT &&
      existingUser &&
      !existingUser._id.equals(owner._id)
    ) {
      throw new AppError(
        input.channel === OtpChannel.EMAIL ? 'EMAIL_EXISTS' : 'PHONE_EXISTS',
        409,
        input.channel === OtpChannel.EMAIL
          ? 'Email này đã được sử dụng'
          : 'Số điện thoại này đã được sử dụng',
      );
    }
    // Xóa tài khoản chỉ gửi mã tới liên hệ hiện có của chính chủ.
    const current = input.channel === OtpChannel.EMAIL ? owner.email : owner.phoneNumber;
    if (input.purpose === OtpPurpose.DELETE_ACCOUNT && current !== target) {
      throw new AppError('VALIDATION_ERROR', 400, 'Mã chỉ gửi tới liên hệ của tài khoản');
    }
  }

  if (input.purpose === OtpPurpose.REGISTER && existingUser) {
    throw new AppError(
      input.channel === OtpChannel.EMAIL ? 'EMAIL_EXISTS' : 'PHONE_EXISTS',
      409,
      input.channel === OtpChannel.EMAIL
        ? 'Email này đã được sử dụng'
        : 'Số điện thoại này đã được sử dụng',
    );
  }

  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const recentOtps = await OtpModel.find({
    target,
    purpose: input.purpose,
    createdAt: { $gte: windowStart },
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  const lastSentAt = recentOtps.at(-1)?.createdAt ?? null;
  const resendCheck = canResendOtp({
    lastSentAt,
    sentCountLastHour: recentOtps.length,
    oldestSentAtLastHour: recentOtps[0]?.createdAt ?? null,
    now,
  });

  if (!resendCheck.allowed) {
    throw new AppError(
      resendCheck.reason,
      429,
      resendCheck.reason === 'OTP_RESEND_LIMIT'
        ? 'Bạn đã gửi quá nhiều mã trong một giờ'
        : `Vui lòng đợi ${resendCheck.retryAfterSeconds} giây để gửi lại mã`,
      { retryAfterSeconds: resendCheck.retryAfterSeconds },
    );
  }

  const code = crypto.randomInt(100_000, 1_000_000).toString();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  const otp = await OtpModel.create({
    userId: ACCOUNT_PURPOSES.includes(input.purpose)
      ? new Types.ObjectId(input.userId!)
      : (existingUser?._id ?? null),
    purpose: input.purpose,
    channel: input.channel,
    target,
    codeHash,
    expiresAt,
  });

  if (input.channel === OtpChannel.EMAIL) {
    // Gửi lỗi thì xóa bản ghi để lần thất bại không tính vào giới hạn 60 giây / 5 lần mỗi giờ.
    await sendOtpEmail(target, code, input.purpose).catch(async (error: unknown) => {
      await OtpModel.deleteOne({ _id: otp._id });
      throw error;
    });
  } else {
    // OTP số điện thoại mô phỏng: chỉ ghi log theo docs/architecture.md 5.3.
    logger.warn({ target, code }, 'OTP số điện thoại (mô phỏng)');
  }

  return {
    otpId: String(otp._id),
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(now.getTime() + OTP_RESEND_INTERVAL_SECONDS * 1000).toISOString(),
    devCode: process.env['NODE_ENV'] !== 'production' ? code : undefined,
  };
}

export async function verifyOtp(otpId: string, code: string): Promise<{ verified: true }> {
  const otp = await OtpModel.findById(otpId);

  if (!otp) {
    throw new AppError('OTP_INVALID', 409, 'Mã xác thực không hợp lệ');
  }

  if (otp.expiresAt.getTime() <= Date.now()) {
    throw new AppError('OTP_EXPIRED', 409, 'Mã xác thực đã hết hạn');
  }

  if (otp.failedAttempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('OTP_ATTEMPTS_EXCEEDED', 409, 'Bạn đã nhập sai quá số lần cho phép');
  }

  const matches = await bcrypt.compare(code, otp.codeHash);
  if (!matches) {
    otp.failedAttempts += 1;
    await otp.save();

    const remainingAttempts = OTP_MAX_ATTEMPTS - otp.failedAttempts;
    if (remainingAttempts <= 0) {
      throw new AppError('OTP_ATTEMPTS_EXCEEDED', 409, 'Bạn đã nhập sai quá số lần cho phép');
    }

    throw new AppError('OTP_INVALID', 409, 'Mã xác thực không đúng', { remainingAttempts });
  }

  otp.isVerified = true;
  otp.verifiedAt = new Date();
  // Mã gốc chỉ sống 5 phút từ lúc gửi; gia hạn để khách kịp điền form / đặt mật khẩu mới.
  otp.expiresAt = new Date(Date.now() + VERIFIED_OTP_TTL_SECONDS * 1000);
  await otp.save();

  return { verified: true };
}

/**
 * Dùng cho register / đặt lại mật khẩu: OTP phải đã verify, còn hạn và đúng mục đích.
 * Đánh dấu `consumedAt` nguyên tử để mỗi OTP chỉ dùng được một lần (chống replay).
 */
export async function consumeVerifiedOtp(otpId: string, purpose: OtpPurpose) {
  const otp = await OtpModel.findOneAndUpdate(
    {
      _id: otpId,
      purpose,
      isVerified: true,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { new: true },
  );

  if (!otp) {
    throw new AppError('OTP_INVALID', 409, 'Mã xác thực chưa được xác nhận hoặc đã hết hạn');
  }

  return otp;
}
