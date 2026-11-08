import { z } from 'zod';
import { ADMIN_ROLE_NAMES, RoleName, UserStatus } from '../../lib/shared-enums.js';
import { ADMIN_MIN_PASSWORD_LENGTH } from './admin-account.rules.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã định danh không hợp lệ');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const adminRole = z.enum(ADMIN_ROLE_NAMES as [RoleName, ...RoleName[]]);
const phone = z.string().trim().regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ (ví dụ: 0901234567)');
const fullName = z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(100, 'Họ tên tối đa 100 ký tự');

const paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const idParamsSchema = z.object({ id: objectId });
export const configKeyParamsSchema = z.object({ key: z.string().min(1).max(100) });

export const adminListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  roleName: adminRole.optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.LOCKED]).optional(),
  ...paging,
});

export const createAdminSchema = z.object({
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
  fullName,
  roleName: adminRole,
  phoneNumber: phone.optional(),
});

export const updateAdminSchema = z
  .object({ fullName: fullName.optional(), phoneNumber: z.union([phone, z.literal(''), z.null()]).optional() })
  .refine((body) => body.fullName !== undefined || body.phoneNumber !== undefined, 'Không có thông tin nào để cập nhật');

export const changeRoleSchema = z.object({ roleName: adminRole });

export const deactivateSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const auditLogQuerySchema = z
  .object({
    userId: objectId.optional(),
    action: z.string().trim().max(60).optional(),
    targetType: z.string().trim().max(60).optional(),
    from: day.optional(),
    to: day.optional(),
    ...paging,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'Từ ngày phải trước đến ngày', path: ['from'] });

export const updateConfigSchema = z.object({ value: z.unknown().refine((v) => v !== undefined, 'Thiếu value') });

export const overviewQuerySchema = z.object({
  range: z.enum(['today', '7d', '30d', 'month']).default('30d'),
});

export const setPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(ADMIN_MIN_PASSWORD_LENGTH, `Mật khẩu cần ít nhất ${ADMIN_MIN_PASSWORD_LENGTH} ký tự`)
    .max(72, 'Mật khẩu tối đa 72 ký tự'),
});
