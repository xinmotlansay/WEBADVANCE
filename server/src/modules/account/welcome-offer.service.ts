import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../../config/index.js';
import { sendWelcomeVoucherEmail } from '../../integrations/brevo.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../utils/app-error.js';
import { createAddress } from '../addresses/address.service.js';
import { UserModel } from '../auth/auth.model.js';
import { OrderModel } from '../orders/order.model.js';
import { UserVoucherModel } from '../vouchers/user-voucher.model.js';
import { VoucherModel } from '../vouchers/voucher.model.js';
import type { ClaimWelcomeOfferBody } from './account.schema.js';
import { getProfile, updateProfile } from './account.service.js';

export const WELCOME_VOUCHER_CODE = 'NEW11';
const VALID_DAYS = 30;
const CONFIRM_AUDIENCE = 'welcome-offer-confirm';

export interface WelcomeOfferStatus {
  /** Chưa có đơn nào còn hiệu lực. */
  eligible: boolean;
  claimed: boolean;
  /** Email của tài khoản, null nếu đăng ký bằng SĐT (popup sẽ hỏi email nhận mã). */
  email: string | null;
  phoneNumber: string | null;
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: string | null;
}

export interface WelcomeOfferResult {
  code: string;
  expiresAt: string;
  sentTo: string;
  emailSent: boolean;
}

/** Tạo voucher NEW11 nếu chưa có; không ghi đè nếu Marketing đã chỉnh trong trang quản trị. */
async function ensureWelcomeVoucher() {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 1);
  return VoucherModel.findOneAndUpdate(
    { code: WELCOME_VOUCHER_CODE },
    {
      $setOnInsert: {
        code: WELCOME_VOUCHER_CODE,
        name: 'Ưu đãi 10% cho khách hàng mới',
        description: 'Giảm 10% cho đơn hàng đầu tiên của khách hàng mới.',
        type: 'ASSIGNED',
        customerGroup: 'NEW_CUSTOMER',
        stackableWithPromotion: false,
        discountType: 'PERCENT',
        discountValue: 10,
        scope: [],
        perUserLimit: 1,
        usedCount: 0,
        startDate: now,
        endDate,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
      },
    },
    { upsert: true, new: true },
  ).lean();
}

const hasOrder = (userId: Types.ObjectId) =>
  OrderModel.exists({ userId, status: { $ne: 'CANCELLED' } });

export async function getWelcomeOfferStatus(userId: Types.ObjectId): Promise<WelcomeOfferStatus> {
  const [profile, voucher, ordered] = await Promise.all([
    getProfile(userId),
    VoucherModel.findOne({ code: WELCOME_VOUCHER_CODE }).select('_id').lean(),
    hasOrder(userId),
  ]);
  const claimed = voucher ? Boolean(await UserVoucherModel.exists({ userId, voucherId: voucher._id })) : false;
  return {
    eligible: !ordered,
    claimed,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    fullName: profile.fullName,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
  };
}

export async function claimWelcomeOffer(
  userId: Types.ObjectId,
  body: ClaimWelcomeOfferBody,
): Promise<WelcomeOfferResult> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tài khoản');

  const email = user.email ?? body.email?.toLowerCase();
  if (!email) throw new AppError('EMAIL_REQUIRED', 400, 'Nhập email để nhận mã giảm giá');
  const phone = user.phoneNumber ?? body.phoneNumber;
  if (!phone) throw new AppError('PHONE_REQUIRED', 400, 'Nhập số điện thoại nhận hàng');

  if (await hasOrder(userId)) {
    throw new AppError('NOT_NEW_CUSTOMER', 409, 'Ưu đãi chỉ dành cho khách hàng chưa có đơn hàng');
  }

  const voucher = await ensureWelcomeVoucher();
  if (!voucher) throw new AppError('INTERNAL', 500, 'Không tạo được mã ưu đãi');
  if (await UserVoucherModel.exists({ userId, voucherId: voucher._id })) {
    throw new AppError('ALREADY_CLAIMED', 409, 'Bạn đã nhận ưu đãi khách hàng mới rồi');
  }

  // Chưa cấp vào ví: khách phải bấm xác nhận trong email (confirmWelcomeOffer) mới nhận.
  const expiresAt = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);
  const confirmToken = jwt.sign({ sub: userId.toString() }, config.jwtSecret, {
    expiresIn: `${VALID_DAYS}d`,
    audience: CONFIRM_AUDIENCE,
  });
  const confirmUrl = `${config.customerWebUrl}/welcome-offer/confirm?token=${encodeURIComponent(confirmToken)}`;

  const profileBefore = await getProfile(userId);
  await updateProfile(userId, {
    fullName: body.fullName,
    gender: body.gender,
    // Giữ nguyên ngày sinh đã có để không tốn lượt sửa.
    ...(profileBefore.dateOfBirth ? {} : { dateOfBirth: body.dateOfBirth }),
  });
  await createAddress(userId, {
    recipientName: body.fullName,
    recipientPhone: phone,
    addressLine: body.addressLine,
    ward: body.ward,
    district: body.district,
    province: body.province,
    isDefault: false,
  });

  let emailSent = false;
  try {
    emailSent = await sendWelcomeVoucherEmail(email, body.fullName, WELCOME_VOUCHER_CODE, confirmUrl);
  } catch (error) {
    logger.error({ err: error, userId: userId.toString() }, 'Gửi email mã khách mới thất bại');
  }

  return { code: WELCOME_VOUCHER_CODE, expiresAt: expiresAt.toISOString(), sentTo: email, emailSent };
}

/** Khách bấm liên kết trong email (đã đăng nhập đúng tài khoản) thì voucher mới vào ví. */
export async function confirmWelcomeOffer(userId: Types.ObjectId, token: string): Promise<WelcomeOfferResult> {
  let sub: string | undefined;
  try {
    sub = (jwt.verify(token, config.jwtSecret, { audience: CONFIRM_AUDIENCE }) as { sub?: string }).sub;
  } catch {
    throw new AppError('INVALID_TOKEN', 400, 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn');
  }
  if (sub !== userId.toString()) {
    throw new AppError('WRONG_ACCOUNT', 403, 'Liên kết này thuộc về tài khoản khác. Hãy đăng nhập đúng tài khoản nhận email.');
  }
  if (await hasOrder(userId)) {
    throw new AppError('NOT_NEW_CUSTOMER', 409, 'Ưu đãi chỉ dành cho khách hàng chưa có đơn hàng');
  }
  const voucher = await ensureWelcomeVoucher();
  if (!voucher) throw new AppError('INTERNAL', 500, 'Không tạo được mã ưu đãi');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + VALID_DAYS * 24 * 60 * 60 * 1000);
  // Bấm lại liên kết thì giữ nguyên bản đã có, không tạo thêm.
  const granted = await UserVoucherModel.findOneAndUpdate(
    { userId, voucherId: voucher._id },
    {
      $setOnInsert: {
        userId,
        voucherId: voucher._id,
        source: 'GIFTED',
        receivedAt: now,
        expiresAt,
        status: 'UNUSED',
        seenAt: now,
      },
    },
    { upsert: true, new: true },
  ).lean();
  const user = await UserModel.findById(userId).select('email').lean();
  return {
    code: WELCOME_VOUCHER_CODE,
    expiresAt: (granted?.expiresAt ?? expiresAt).toISOString(),
    sentTo: user?.email ?? '',
    emailSent: true,
  };
}
