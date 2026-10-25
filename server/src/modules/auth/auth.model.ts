import { Schema, model, type Types } from 'mongoose';
export interface UserDoc {
  _id: Types.ObjectId;
  roleId: Types.ObjectId;
  email?: string;
  phoneNumber?: string;
  passwordHash?: string;
  profile: { fullName: string };
  avatar?: string;
  status: 'ACTIVE' | 'LOCKED' | 'ANONYMIZED';
  security?: {
    failedLoginCount?: number;
    lockCount?: number;
    lockedUntil?: Date;
    mustChangePassword?: boolean;
  };
}
export const UserModel = model<UserDoc>(
  'users',
  new Schema<UserDoc>(
    {
      roleId: Schema.Types.ObjectId,
      email: String,
      phoneNumber: String,
      passwordHash: { type: String, select: false },
      profile: { fullName: String },
      avatar: String,
      status: String,
      security: {
        failedLoginCount: Number,
        lockCount: Number,
        lockedUntil: Date,
        mustChangePassword: Boolean,
      },
    },
    { strict: false },
  ),
);
export const RoleModel = model<{ _id: Types.ObjectId; name: string }>(
  'roles',
  new Schema({ name: String }),
);
export const AuthSessionModel = model<{
  _id: string;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}>(
  'auth_sessions',
  new Schema({
    _id: String,
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  }),
);
