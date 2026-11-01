import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { config } from '../../config/index.js';
import { sendAdminInviteEmail } from '../../integrations/resend.js';
import {
  ADMIN_ROLE_NAMES,
  AuthSource,
  OtpChannel,
  OtpPurpose,
  RoleName,
  UserStatus,
} from '../../lib/shared-enums.js';
import { AppError } from '../../utils/app-error.js';
import { OtpModel, RoleModel, UserModel, type IRole } from '../auth/auth.model.js';
import { revokeAllSessions } from '../auth/token.service.js';
import { ADMIN_INVITE_TTL_HOURS, assertAdminChangeAllowed } from './admin-account.rules.js';
import { recordAudit } from './audit-log.service.js';
import { PERMISSION_MATRIX, ROLE_DASHBOARDS } from './permission-matrix.js';

const BCRYPT_ROUNDS = 12;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  [RoleName.SUPER_ADMIN]: 'Quản trị viên cấp cao',
  [RoleName.PRODUCT_ADMIN]: 'Quản trị sản phẩm',
  [RoleName.MARKETING_ADMIN]: 'Quản trị marketing',
  [RoleName.ORDER_ADMIN]: 'Quản trị đơn hàng',
};

export interface AdminAccountView {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  roleName: RoleName;
  status: UserStatus;
  /** Chưa đặt mật khẩu: liên kết mời đang chờ hoặc đã hết hạn. */
  pendingInvite: boolean;
  lockInfo: { reason: string | null; lockedAt: Date | null } | null;
  createdAt: Date;
}

type AdminUserLean = {
  _id: Types.ObjectId;
  email?: string | null;
  phoneNumber?: string | null;
  avatar?: string;
  passwordHash?: string | null;
  profile: { fullName: string };
  roleId: IRole;
  status: UserStatus;
  lockInfo?: { reason?: string | null; lockedAt?: Date | null };
  createdAt?: Date;
};

function toView(user: AdminUserLean): AdminAccountView {
  return {
    id: String(user._id),
    fullName: user.profile.fullName,
    email: user.email ?? null,
    phoneNumber: user.phoneNumber ?? null,
    avatar: user.avatar ?? '',
    roleName: user.roleId.name as RoleName,
    status: user.status,
    pendingInvite: !user.passwordHash,
    lockInfo:
      user.status === UserStatus.LOCKED
        ? { reason: user.lockInfo?.reason ?? null, lockedAt: user.lockInfo?.lockedAt ?? null }
        : null,
    createdAt: user.createdAt ?? new Date(0),
  };
}

/** Vai trò admin luôn có trong DB (tạo nếu thiếu), trả map tên → _id. */
async function adminRoleIds(): Promise<Map<string, Types.ObjectId>> {
  const roles = await Promise.all(
    ADMIN_ROLE_NAMES.map((name) =>
      RoleModel.findOneAndUpdate(
        { name },
        { $setOnInsert: { name, description: ROLE_DESCRIPTIONS[name] ?? '' } },
        { upsert: true, new: true },
      ).lean(),
    ),
  );
  return new Map(roles.map((role) => [role!.name, role!._id]));
}

async function findAdmin(id: string) {
  const roleIds = [...(await adminRoleIds()).values()];
  const user = await UserModel.findOne({ _id: new Types.ObjectId(id), roleId: { $in: roleIds } })
    .select('+passwordHash')
    .populate<{ roleId: IRole }>('roleId', 'name');
  if (!user) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy tài khoản Admin');
  return user;
}

async function countActiveSuperAdmins(): Promise<number> {
  const roleIds = await adminRoleIds();
  return UserModel.countDocuments({
    roleId: roleIds.get(RoleName.SUPER_ADMIN),
    status: UserStatus.ACTIVE,
  });
}

export interface AdminListQuery {
  q?: string;
  roleName?: RoleName;
  status?: UserStatus;
  page: number;
  limit: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** AD-10: danh sách tài khoản Admin kèm số liệu theo vai trò cho cột tổng quan. */
export async function listAdmins(query: AdminListQuery) {
  const roleIds = await adminRoleIds();
  const filter: Record<string, unknown> = {
    roleId: query.roleName ? roleIds.get(query.roleName) : { $in: [...roleIds.values()] },
  };
  if (query.status) filter['status'] = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter['$or'] = [{ 'profile.fullName': pattern }, { email: pattern }, { phoneNumber: pattern }];
  }

  const [rows, total, summaryRows] = await Promise.all([
    UserModel.find(filter)
      .select('+passwordHash')
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate<{ roleId: IRole }>('roleId', 'name')
      .lean(),
    UserModel.countDocuments(filter),
    UserModel.aggregate<{ _id: { roleId: Types.ObjectId; status: string; invited: boolean }; count: number }>([
      { $match: { roleId: { $in: [...roleIds.values()] } } },
      {
        $group: {
          _id: {
            roleId: '$roleId',
            status: '$status',
            invited: { $not: [{ $ifNull: ['$passwordHash', false] }] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const nameById = new Map([...roleIds].map(([name, id]) => [String(id), name]));
  const byRole: Record<string, { active: number; locked: number }> = Object.fromEntries(
    ADMIN_ROLE_NAMES.map((name) => [name, { active: 0, locked: 0 }]),
  );
  let pendingInvites = 0;
  for (const row of summaryRows) {
    const bucket = byRole[nameById.get(String(row._id.roleId)) ?? ''];
    if (!bucket) continue;
    if (row._id.status === UserStatus.ACTIVE) bucket.active += row.count;
    else bucket.locked += row.count;
    if (row._id.invited && row._id.status === UserStatus.ACTIVE) pendingInvites += row.count;
  }

  return {
    data: rows.map((row) => toView(row as unknown as AdminUserLean)),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    summary: { byRole, pendingInvites },
  };
}

/** Tạo liên kết đặt mật khẩu mới (thu hồi liên kết cũ chưa dùng) và gửi email. */
async function issueInvite(user: { _id: Types.ObjectId; email?: string | null; profile: { fullName: string } }) {
  const email = user.email ?? '';
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ADMIN_INVITE_TTL_HOURS * 3_600_000);

  await OtpModel.deleteMany({ userId: user._id, purpose: OtpPurpose.ADMIN_SET_PASSWORD, isVerified: false });
  await OtpModel.create({
    userId: user._id,
    purpose: OtpPurpose.ADMIN_SET_PASSWORD,
    channel: OtpChannel.EMAIL,
    target: email,
    codeHash: hashInviteToken(token),
    expiresAt,
  });

  const link = `${config.adminWebUrl}/dat-mat-khau?token=${encodeURIComponent(token)}`;
  await sendAdminInviteEmail(email, user.profile.fullName, link, ADMIN_INVITE_TTL_HOURS);
  return { expiresAt };
}

function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CreateAdminInput {
  email: string;
  fullName: string;
  roleName: RoleName;
  phoneNumber?: string;
}

/** AD-11: tạo tài khoản Admin chưa có mật khẩu, gửi liên kết đặt mật khẩu. Không trả mật khẩu cho ai. */
export async function createAdmin(req: Request, input: CreateAdminInput) {
  const roleIds = await adminRoleIds();
  const user = await UserModel.create({
    roleId: roleIds.get(input.roleName),
    email: input.email,
    ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
    authSource: AuthSource.EMAIL,
    profile: { fullName: input.fullName },
    status: UserStatus.ACTIVE,
  });

  const invite = await issueInvite(user);
  await recordAudit(req, {
    action: 'ADMIN_CREATE',
    targetType: 'ADMIN',
    targetId: String(user._id),
    newValue: { email: input.email, fullName: input.fullName, roleName: input.roleName },
  });

  const created = await findAdmin(String(user._id));
  return { admin: toView(created.toObject() as unknown as AdminUserLean), inviteExpiresAt: invite.expiresAt };
}

export async function resendInvite(req: Request, id: string) {
  const user = await findAdmin(id);
  if (user.passwordHash) {
    throw new AppError('CONFLICT', 409, 'Tài khoản này đã đặt mật khẩu');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new AppError('CONFLICT', 409, 'Kích hoạt lại tài khoản trước khi gửi liên kết');
  }
  const invite = await issueInvite(user);
  await recordAudit(req, { action: 'ADMIN_INVITE_RESEND', targetType: 'ADMIN', targetId: id });
  return { inviteExpiresAt: invite.expiresAt };
}

export interface UpdateAdminInput {
  fullName?: string;
  phoneNumber?: string | null;
}

/** AD-12: sửa thông tin (họ tên, số điện thoại). Email là tên đăng nhập nên không đổi ở đây. */
export async function updateAdmin(req: Request, id: string, input: UpdateAdminInput) {
  const user = await findAdmin(id);
  const before = { fullName: user.profile.fullName, phoneNumber: user.phoneNumber ?? null };

  if (input.fullName !== undefined) user.profile.fullName = input.fullName;
  if (input.phoneNumber !== undefined) user.phoneNumber = input.phoneNumber || undefined;
  await user.save();

  await recordAudit(req, {
    action: 'ADMIN_UPDATE',
    targetType: 'ADMIN',
    targetId: id,
    oldValue: before,
    newValue: { fullName: user.profile.fullName, phoneNumber: user.phoneNumber ?? null },
  });
  return toView(user.toObject() as unknown as AdminUserLean);
}

/** AD-13: đổi sang đúng một vai trò admin khác. */
export async function changeAdminRole(req: Request, id: string, roleName: RoleName) {
  const user = await findAdmin(id);
  const currentRole = user.roleId.name as RoleName;
  if (currentRole === roleName) return toView(user.toObject() as unknown as AdminUserLean);

  assertAdminChangeAllowed('CHANGE_ROLE', {
    actorId: req.user!.id,
    targetId: id,
    targetIsActiveSuperAdmin: currentRole === RoleName.SUPER_ADMIN && user.status === UserStatus.ACTIVE,
    keepsSuperAdmin: roleName === RoleName.SUPER_ADMIN,
    activeSuperAdminCount: await countActiveSuperAdmins(),
  });

  const roleIds = await adminRoleIds();
  await UserModel.updateOne({ _id: user._id }, { $set: { roleId: roleIds.get(roleName) } });
  // Token cũ mang vai trò cũ: buộc đăng nhập lại để menu và quyền khớp vai trò mới.
  await revokeAllSessions(id);

  await recordAudit(req, {
    action: 'ADMIN_ROLE_CHANGE',
    targetType: 'ADMIN',
    targetId: id,
    oldValue: { roleName: currentRole },
    newValue: { roleName },
  });
  return toView((await findAdmin(id)).toObject() as unknown as AdminUserLean);
}

/** AD-12: vô hiệu hóa (status LOCKED), không xóa cứng để giữ nhật ký. Thu hồi mọi phiên. */
export async function deactivateAdmin(req: Request, id: string, reason: string | undefined) {
  const user = await findAdmin(id);
  if (user.status === UserStatus.LOCKED) return toView(user.toObject() as unknown as AdminUserLean);

  assertAdminChangeAllowed('DEACTIVATE', {
    actorId: req.user!.id,
    targetId: id,
    targetIsActiveSuperAdmin: user.roleId.name === RoleName.SUPER_ADMIN,
    activeSuperAdminCount: await countActiveSuperAdmins(),
  });

  user.status = UserStatus.LOCKED;
  user.lockInfo = {
    reason: reason || 'Tài khoản quản trị đã bị vô hiệu hóa',
    lockedBy: new Types.ObjectId(req.user!.id),
    lockedAt: new Date(),
  };
  await user.save();
  await revokeAllSessions(id);

  await recordAudit(req, {
    action: 'ADMIN_DEACTIVATE',
    targetType: 'ADMIN',
    targetId: id,
    oldValue: { status: UserStatus.ACTIVE },
    newValue: { status: UserStatus.LOCKED, reason: user.lockInfo.reason },
  });
  return toView(user.toObject() as unknown as AdminUserLean);
}

export async function activateAdmin(req: Request, id: string) {
  const user = await findAdmin(id);
  if (user.status === UserStatus.ACTIVE) return toView(user.toObject() as unknown as AdminUserLean);

  user.status = UserStatus.ACTIVE;
  user.lockInfo = { reason: null, lockedBy: null, lockedAt: null };
  user.security.failedLoginCount = 0;
  user.security.lockedUntil = null;
  await user.save();

  await recordAudit(req, {
    action: 'ADMIN_ACTIVATE',
    targetType: 'ADMIN',
    targetId: id,
    oldValue: { status: UserStatus.LOCKED },
    newValue: { status: UserStatus.ACTIVE },
  });
  return toView(user.toObject() as unknown as AdminUserLean);
}

/** AD-14: vai trò và ma trận quyền cố định (chỉ đọc). */
export async function listRoles() {
  const roleIds = await adminRoleIds();
  const counts = await UserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { roleId: { $in: [...roleIds.values()] }, status: UserStatus.ACTIVE } },
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));

  return {
    roles: ADMIN_ROLE_NAMES.map((name) => ({
      name,
      description: ROLE_DESCRIPTIONS[name] ?? '',
      dashboard: ROLE_DASHBOARDS[name] ?? '',
      activeAdminCount: countById.get(String(roleIds.get(name))) ?? 0,
    })),
    matrix: PERMISSION_MATRIX,
  };
}

/**
 * POST /admin/auth/set-password: Admin mới đặt mật khẩu bằng liên kết trong email. Liên kết dùng một lần,
 * sai hoặc hết hạn đều trả cùng một lỗi để không lộ tài khoản.
 */
export async function setPasswordFromInvite(token: string, password: string): Promise<{ email: string }> {
  const invalid = new AppError('INVITE_INVALID', 400, 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy nhờ Admin cấp cao gửi lại.');
  const otp = await OtpModel.findOneAndUpdate(
    {
      purpose: OtpPurpose.ADMIN_SET_PASSWORD,
      codeHash: hashInviteToken(token),
      isVerified: false,
      expiresAt: { $gt: new Date() },
    },
    { $set: { isVerified: true, verifiedAt: new Date() } },
  );
  if (!otp?.userId) throw invalid;

  const user = await UserModel.findById(otp.userId).populate<{ roleId: IRole }>('roleId', 'name');
  if (!user || user.status !== UserStatus.ACTIVE || !ADMIN_ROLE_NAMES.includes(user.roleId?.name as RoleName)) {
    throw invalid;
  }

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        'security.mustChangePassword': false,
        'security.failedLoginCount': 0,
        'security.lockedUntil': null,
      },
    },
  );
  return { email: user.email ?? '' };
}
