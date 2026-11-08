import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { OtpChannel, OtpPurpose, UserStatus } from '../../lib/shared-enums.js';
import { AppError } from '../../utils/app-error.js';
import { AddressModel } from '../addresses/address.model.js';
import { OtpModel, UserModel } from '../auth/auth.model.js';
import { consumeVerifiedOtp, normalizeTarget } from '../auth/otp.service.js';
import { revokeAllSessions } from '../auth/token.service.js';
import { OrderModel, type OrderStatus } from '../orders/order.model.js';
import { ProductModel } from '../products/product.model.js';
import { buildListItems, type ProductListItem } from '../products/product.service.js';
import { ReturnRequestModel, WarrantyRequestModel } from '../after-sales/after-sales.model.js';
import { UserVoucherModel } from '../vouchers/user-voucher.model.js';
import { VoucherModel } from '../vouchers/voucher.model.js';
import { isNewGift } from '../vouchers/voucher.rules.js';
import type { ChangeContactBody, UpdateProfileBody, WalkwayProfileBody } from './account.schema.js';
import { WalkwayProfileModel, type WalkwayProfileDoc } from './walkway-profile.model.js';
import { WishlistModel } from './wishlist.model.js';

const BCRYPT_ROUNDS = 12;
const MAX_BIRTH_DATE_EDITS = 2;
const CLOSED_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];
const CLOSED_REQUEST_STATUSES = ['COMPLETED', 'REJECTED', 'CANCELLED'];

export interface ProfileView {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: string | null;
  birthDateEditCount: number;
  hasPassword: boolean;
}

async function loadUser(userId: Types.ObjectId) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user || user.status === UserStatus.ANONYMIZED) {
    throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tài khoản');
  }
  return user;
}

const toProfile = (user: Awaited<ReturnType<typeof loadUser>>): ProfileView => ({
  id: user._id.toString(),
  fullName: user.profile.fullName,
  email: user.email ?? null,
  phoneNumber: user.phoneNumber ?? null,
  avatar: user.avatar ?? '',
  gender: user.profile.gender ?? null,
  dateOfBirth: user.profile.dateOfBirth ? user.profile.dateOfBirth.toISOString().slice(0, 10) : null,
  birthDateEditCount: user.profile.birthDateEditCount ?? 0,
  hasPassword: Boolean(user.passwordHash),
});

export async function getProfile(userId: Types.ObjectId): Promise<ProfileView> {
  return toProfile(await loadUser(userId));
}

/** API Design 2.1: đổi ngày sinh tính một lần sửa, tối đa 2 lần. Đổi email/SĐT qua `PUT /users/me/contact` (OTP). */
export async function updateProfile(
  userId: Types.ObjectId,
  body: UpdateProfileBody,
): Promise<ProfileView> {
  const user = await loadUser(userId);

  if (body.fullName !== undefined) user.profile.fullName = body.fullName;
  if (body.gender !== undefined) user.profile.gender = body.gender;

  if (body.dateOfBirth !== undefined) {
    const current = user.profile.dateOfBirth?.toISOString().slice(0, 10) ?? null;
    if (body.dateOfBirth !== current) {
      if ((user.profile.birthDateEditCount ?? 0) >= MAX_BIRTH_DATE_EDITS) {
        throw new AppError('BIRTHDATE_EDIT_LIMIT', 409, 'Ngày sinh chỉ được cập nhật tối đa 2 lần');
      }
      user.profile.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
      user.profile.birthDateEditCount = (user.profile.birthDateEditCount ?? 0) + 1;
    }
  }

  if (body.avatar !== undefined) user.avatar = body.avatar;

  await user.save();
  return toProfile(user);
}

/** FR-12, API Design 2.3: chặn khi còn đơn hoặc yêu cầu hậu mãi đang mở, rồi ẩn danh hóa. */
export async function requestAccountDeletion(
  userId: Types.ObjectId,
  proof: { password?: string; otpId?: string },
): Promise<void> {
  const user = await loadUser(userId);
  if (proof.otpId) {
    const otp = await consumeVerifiedOtp(proof.otpId, OtpPurpose.DELETE_ACCOUNT);
    if (!otp.userId?.equals(userId)) throw new AppError('OTP_INVALID', 409, 'Mã xác thực không hợp lệ');
    await OtpModel.deleteOne({ _id: otp._id });
  } else if (user.passwordHash) {
    const matches = proof.password ? await bcrypt.compare(proof.password, user.passwordHash) : false;
    if (!matches) throw new AppError('INVALID_CREDENTIALS', 401, 'Mật khẩu không đúng');
  } else {
    throw new AppError('VALIDATION_ERROR', 400, 'Cần mật khẩu hoặc mã xác thực OTP');
  }

  const [openOrder, openWarranty, openReturn] = await Promise.all([
    OrderModel.exists({ userId, status: { $nin: CLOSED_ORDER_STATUSES } }),
    WarrantyRequestModel.exists({ userId, status: { $nin: CLOSED_REQUEST_STATUSES } }),
    ReturnRequestModel.exists({ userId, status: { $nin: CLOSED_REQUEST_STATUSES } }),
  ]);
  if (openOrder || openWarranty || openReturn) {
    throw new AppError(
      'ACCOUNT_HAS_OPEN_REQUESTS',
      409,
      'Còn đơn hàng hoặc yêu cầu hậu mãi đang xử lý, hãy hoàn tất trước khi xóa tài khoản',
    );
  }

  await Promise.all([
    UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          status: UserStatus.ANONYMIZED,
          anonymizedAt: new Date(),
          'profile.fullName': 'Khách hàng đã xóa',
          'profile.dateOfBirth': null,
          'profile.gender': null,
          avatar: '',
        },
        $unset: { email: '', phoneNumber: '', googleId: '', passwordHash: '' },
      },
    ),
    AddressModel.deleteMany({ userId }),
    WishlistModel.deleteMany({ userId }),
    WalkwayProfileModel.deleteMany({ userId }),
  ]);
  await revokeAllSessions(userId.toString());
}

/** FR-07, API Design 2.2: đổi/bổ sung email hoặc SĐT sau khi OTP gửi tới đúng `target` mới đã verify. */
export async function changeContact(
  userId: Types.ObjectId,
  body: ChangeContactBody,
): Promise<ProfileView> {
  const user = await loadUser(userId);
  const channel = body.channel === 'EMAIL' ? OtpChannel.EMAIL : OtpChannel.PHONE;
  const target = normalizeTarget(channel, body.target);

  const otp = await consumeVerifiedOtp(body.otpId, OtpPurpose.CHANGE_CONTACT);
  if (!otp.userId?.equals(userId) || otp.channel !== channel || otp.target !== target) {
    throw new AppError('OTP_INVALID', 409, 'Mã xác thực không khớp với thông tin liên hệ');
  }

  const field = channel === OtpChannel.EMAIL ? 'email' : 'phoneNumber';
  const clash = await UserModel.exists({ [field]: target, _id: { $ne: userId } });
  if (clash) {
    throw new AppError(
      channel === OtpChannel.EMAIL ? 'EMAIL_EXISTS' : 'PHONE_EXISTS',
      409,
      channel === OtpChannel.EMAIL ? 'Email này đã được sử dụng' : 'Số điện thoại này đã được sử dụng',
    );
  }

  user[field] = target;
  await user.save();
  await OtpModel.deleteOne({ _id: otp._id });
  return toProfile(user);
}

// ---------------------------------------------------------------- Yêu thích

export type WishlistItem = ProductListItem & { addedAt: string };

export async function listWishlist(userId: Types.ObjectId): Promise<WishlistItem[]> {
  const rows = await WishlistModel.find({ userId }).sort({ addedAt: -1 }).lean();
  const products = await ProductModel.find({
    _id: { $in: rows.map((row) => row.productId) },
    status: 'ACTIVE',
  }).lean();
  const items = new Map((await buildListItems(products)).map((item) => [item.id, item]));
  return rows.flatMap((row) => {
    const item = items.get(row.productId.toString());
    return item ? [{ ...item, isWishlisted: true, addedAt: row.addedAt.toISOString() }] : [];
  });
}

/** Idempotent: thêm lại sản phẩm đã yêu thích vẫn thành công. */
export async function addToWishlist(userId: Types.ObjectId, productId: Types.ObjectId): Promise<void> {
  if (!(await ProductModel.exists({ _id: productId, status: 'ACTIVE' }))) {
    throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');
  }
  await WishlistModel.updateOne(
    { userId, productId },
    { $setOnInsert: { addedAt: new Date() } },
    { upsert: true },
  );
}

export async function removeFromWishlist(userId: Types.ObjectId, productId: Types.ObjectId): Promise<void> {
  await WishlistModel.deleteOne({ userId, productId });
}

// -------------------------------------------------------------- Ví voucher

export interface UserVoucherView {
  id: string;
  code: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue: number | null;
  minOrderValue: number | null;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  expiresAt: string;
  source: string;
  seenAt: string | null;
}

export async function listUserVouchers(
  userId: Types.ObjectId,
  status?: UserVoucherView['status'],
  now = new Date(),
): Promise<UserVoucherView[]> {
  const rows = await UserVoucherModel.find({ userId }).sort({ receivedAt: -1 }).lean();
  const vouchers = new Map(
    (await VoucherModel.find({ _id: { $in: rows.map((row) => row.voucherId) } }).lean()).map((v) => [
      v._id.toString(),
      v,
    ]),
  );
  const views = rows.flatMap((row): UserVoucherView[] => {
    const voucher = vouchers.get(row.voucherId.toString());
    if (!voucher) return [];
    const expiresAt = row.expiresAt ?? voucher.endDate;
    const state = row.status === 'UNUSED' && expiresAt < now ? 'EXPIRED' : row.status;
    return [
      {
        id: row._id.toString(),
        code: voucher.code,
        name: voucher.name ?? voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        maxDiscountValue: voucher.maxDiscountValue ?? null,
        minOrderValue: voucher.minOrderValue ?? null,
        status: state,
        expiresAt: expiresAt.toISOString(),
        source: row.source,
        seenAt: row.seenAt?.toISOString() ?? null,
      },
    ];
  });
  return status ? views.filter((view) => view.status === status) : views;
}

/** Voucher được tặng mà khách chưa xem, để hiện dải thông báo. */
export async function listNewGifts(userId: Types.ObjectId, now = new Date()): Promise<UserVoucherView[]> {
  return (await listUserVouchers(userId, 'UNUSED', now)).filter(isNewGift);
}

/** Khách đã xem/đóng dải thông báo: đánh dấu mọi voucher tặng chưa dùng là đã xem. */
export async function markGiftsSeen(userId: Types.ObjectId, now = new Date()): Promise<void> {
  await UserVoucherModel.updateMany(
    { userId, source: 'GIFTED', status: 'UNUSED', seenAt: null },
    { $set: { seenAt: now } },
  );
}

// ------------------------------------------------------------ Hồ sơ lối đi

export interface WalkwayProfileView {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
  passages: WalkwayProfileDoc['passages'];
}

const toWalkwayView = (doc: WalkwayProfileDoc): WalkwayProfileView => ({
  id: doc._id.toString(),
  name: doc.name,
  address: doc.address ?? '',
  isDefault: doc.isDefault,
  passages: doc.passages,
});

export async function listWalkwayProfiles(userId: Types.ObjectId): Promise<WalkwayProfileView[]> {
  const docs = await WalkwayProfileModel.find({ userId }).sort({ isDefault: -1, _id: 1 }).lean();
  return docs.map(toWalkwayView);
}

const clearDefaultProfile = (userId: Types.ObjectId) =>
  WalkwayProfileModel.updateMany({ userId, isDefault: true }, { isDefault: false });

export async function createWalkwayProfile(
  userId: Types.ObjectId,
  body: WalkwayProfileBody,
): Promise<WalkwayProfileView> {
  // Hồ sơ đầu tiên luôn là mặc định.
  const isDefault = body.isDefault || !(await WalkwayProfileModel.exists({ userId }));
  if (isDefault) await clearDefaultProfile(userId);
  const doc = await WalkwayProfileModel.create({
    userId,
    name: body.name,
    address: body.address,
    isDefault,
    passages: body.passages,
  });
  return toWalkwayView(doc);
}

async function ownProfile(userId: Types.ObjectId, id: Types.ObjectId) {
  const doc = await WalkwayProfileModel.findOne({ _id: id, userId });
  if (!doc) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy hồ sơ');
  return doc;
}

export async function updateWalkwayProfile(
  userId: Types.ObjectId,
  id: Types.ObjectId,
  body: WalkwayProfileBody,
): Promise<WalkwayProfileView> {
  const doc = await ownProfile(userId, id);
  if (body.isDefault && !doc.isDefault) await clearDefaultProfile(userId);
  doc.set({
    name: body.name,
    address: body.address,
    isDefault: doc.isDefault || body.isDefault,
    passages: body.passages,
  });
  await doc.save();
  return toWalkwayView(doc);
}

export async function setDefaultWalkwayProfile(
  userId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<WalkwayProfileView> {
  const doc = await ownProfile(userId, id);
  await clearDefaultProfile(userId);
  doc.isDefault = true;
  await doc.save();
  return toWalkwayView(doc);
}

export async function deleteWalkwayProfile(userId: Types.ObjectId, id: Types.ObjectId): Promise<void> {
  const doc = await ownProfile(userId, id);
  await doc.deleteOne();
  // Xóa hồ sơ mặc định thì hồ sơ còn lại cũ nhất lên làm mặc định.
  if (doc.isDefault) {
    const next = await WalkwayProfileModel.findOne({ userId }).sort({ _id: 1 });
    if (next) await WalkwayProfileModel.updateOne({ _id: next._id }, { isDefault: true });
  }
}
