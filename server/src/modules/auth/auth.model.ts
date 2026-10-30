import { Schema, model, type Types } from 'mongoose';
import { AuthSource, OtpChannel, OtpPurpose, UserStatus } from '../../lib/shared-enums.js';

export interface IRole {
  _id: Types.ObjectId;
  name: string;
  description: string;
}

const roleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export const RoleModel = model<IRole>('Role', roleSchema);

export interface IUserSecurity {
  failedLoginCount: number;
  lockCount: number;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
}

export interface IUserLockInfo {
  reason?: string | null;
  lockedBy?: Types.ObjectId | null;
  lockedAt?: Date | null;
}

export interface IUserProfile {
  fullName: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: Date | null;
  birthDateEditCount: number;
}

export interface IUser {
  roleId: Types.ObjectId;
  phoneNumber?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  authSource: AuthSource;
  profile: IUserProfile;
  avatar: string;
  termsAccepted: boolean;
  termsAcceptedAt?: Date | null;
  status: UserStatus;
  security: IUserSecurity;
  lockInfo: IUserLockInfo;
  anonymizedAt?: Date | null;
}

const userSchema = new Schema<IUser>(
  {
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    phoneNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    authSource: { type: String, enum: Object.values(AuthSource), required: true },
    profile: {
      fullName: { type: String, required: true, trim: true },
      gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], default: null },
      dateOfBirth: { type: Date, default: null },
      birthDateEditCount: { type: Number, default: 0 },
    },
    avatar: { type: String, default: '' },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE },
    security: {
      failedLoginCount: { type: Number, default: 0 },
      lockCount: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
      mustChangePassword: { type: Boolean, default: false },
    },
    lockInfo: {
      reason: { type: String, default: null },
      lockedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      lockedAt: { type: Date, default: null },
    },
    anonymizedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Index partial vì tài khoản có thể chỉ có email hoặc chỉ có số điện thoại.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
userSchema.index(
  { phoneNumber: 1 },
  { unique: true, partialFilterExpression: { phoneNumber: { $type: 'string' } } },
);
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);

export const UserModel = model<IUser>('User', userSchema);

export interface IOtp {
  userId: Types.ObjectId | null;
  purpose: OtpPurpose;
  channel: OtpChannel;
  target: string;
  codeHash: string;
  failedAttempts: number;
  expiresAt: Date;
  isVerified: boolean;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    purpose: { type: String, enum: Object.values(OtpPurpose), required: true },
    channel: { type: String, enum: Object.values(OtpChannel), required: true },
    target: { type: String, required: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    failedAttempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

otpSchema.index({ target: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = model<IOtp>('Otp', otpSchema);

/** Một phiên đăng nhập = một refresh token (chỉ lưu bản băm sha256). */
export interface IAuthSession {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
});

// TTL chỉ dọn khoảng mỗi 60 giây, nên truy vấn vẫn phải tự lọc `expiresAt > now`.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel = model<IAuthSession>('AuthSession', authSessionSchema);
