import type { Request } from 'express';
import { Types } from 'mongoose';
import { getClientIp } from '../../middlewares/auth.middleware.js';
import type { IRole } from '../auth/auth.model.js';
import { AuditLogModel } from './audit-log.model.js';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

const SECRET_KEYS = new Set(['password', 'passwordHash', 'codeHash', 'token']);
const ACCOUNT_KEYS = new Set(['accountNumber']);

/** Không ghi mật khẩu, số tài khoản ngân hàng vào nhật ký (Database Design 32, API 11.6). */
export function redactForAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof Types.ObjectId) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = ACCOUNT_KEYS.has(key) && typeof inner === 'string' ? maskAccount(inner) : redactForAudit(inner);
  }
  return out;
}

function maskAccount(accountNumber: string): string {
  return accountNumber ? `******${accountNumber.slice(-4)}` : '';
}

/** Ghi một dòng nhật ký cho thao tác của admin đang đăng nhập. Phải gọi sau `requireAuth`. */
export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  await AuditLogModel.create({
    userId: new Types.ObjectId(req.user!.id),
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    oldValue: redactForAudit(entry.oldValue ?? null),
    newValue: redactForAudit(entry.newValue ?? null),
    ipAddress: getClientIp(req),
    performedAt: new Date(),
  });
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface AuditLogView {
  id: string;
  actor: { id: string; fullName: string; roleName: string | null } | null;
  action: string;
  targetType: string;
  targetId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string;
  performedAt: Date;
}

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè). */
export function vnDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000+07:00`);
}

export async function listAuditLogs(query: AuditLogQuery) {
  const filter: Record<string, unknown> = {};
  if (query.userId) filter['userId'] = new Types.ObjectId(query.userId);
  if (query.action) filter['action'] = query.action;
  if (query.targetType) filter['targetType'] = query.targetType;
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range['$gte'] = vnDayStart(query.from);
    if (query.to) range['$lt'] = new Date(vnDayStart(query.to).getTime() + 86_400_000);
    filter['performedAt'] = range;
  }

  const [rows, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ performedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate<{ userId: { _id: Types.ObjectId; profile: { fullName: string }; roleId: IRole } | null }>({
        path: 'userId',
        select: 'profile.fullName roleId',
        populate: { path: 'roleId', select: 'name' },
      })
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  const data: AuditLogView[] = rows.map((row) => ({
    id: String(row._id),
    actor: row.userId
      ? {
          id: String(row.userId._id),
          fullName: row.userId.profile?.fullName ?? '',
          roleName: row.userId.roleId?.name ?? null,
        }
      : null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
    ipAddress: row.ipAddress,
    performedAt: row.performedAt,
  }));

  return {
    data,
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}
