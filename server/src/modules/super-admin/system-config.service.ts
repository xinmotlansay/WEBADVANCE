import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { UserModel } from '../auth/auth.model.js';
import { SystemConfigModel } from '../config/system-config.model.js';
import { recordAudit, redactForAudit } from './audit-log.service.js';
import { CONFIG_BY_KEY, CONFIG_DEFINITIONS, CONFIG_GROUPS, type ConfigDefinition } from './system-config.registry.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Giá trị lưu có thể thiếu field (do module khác ghi một phần): lấp bằng mặc định. */
function withDefaults(def: ConfigDefinition, stored: unknown): unknown {
  if (stored === undefined || stored === null) return def.defaultValue;
  if (isPlainObject(def.defaultValue) && isPlainObject(stored)) return { ...def.defaultValue, ...stored };
  return stored;
}

/** GET /admin/system-configs: toàn bộ khóa, nhóm theo chủ đề, kèm mô tả field để dựng form. */
export async function listSystemConfigs() {
  const docs = await SystemConfigModel.find({ _id: { $in: CONFIG_DEFINITIONS.map((d) => d.key) } })
    // `updatedBy` khai báo ref 'users' nhưng model người dùng tên 'User': chỉ định model trực tiếp.
    .populate<{ updatedBy: { profile?: { fullName?: string } } | null }>({
      path: 'updatedBy',
      select: 'profile.fullName',
      model: UserModel,
    })
    .lean();
  const byKey = new Map(docs.map((doc) => [doc._id, doc]));

  return CONFIG_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: CONFIG_DEFINITIONS.filter((def) => def.group === group.key).map((def) => {
      const doc = byKey.get(def.key) as
        | { value: unknown; updatedAt?: Date; updatedBy: { profile?: { fullName?: string } } | null }
        | undefined;
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        fields: def.fields,
        value: withDefaults(def, doc?.value),
        isDefault: !doc,
        updatedAt: doc?.updatedAt ?? null,
        updatedByName: doc?.updatedBy?.profile?.fullName ?? null,
      };
    }),
  }));
}

/** Ràng buộc giữa hai khóa: thời gian hoàn tiền sớm nhất không lớn hơn muộn nhất. */
async function assertCrossKeyRules(key: string, value: unknown): Promise<void> {
  const pair: Record<string, { other: string; minSide: boolean }> = {
    'policy.refundDaysMin': { other: 'policy.refundDaysMax', minSide: true },
    'policy.refundDaysMax': { other: 'policy.refundDaysMin', minSide: false },
  };
  const rule = pair[key];
  if (!rule) return;
  const otherDef = CONFIG_BY_KEY.get(rule.other)!;
  const other = Number(withDefaults(otherDef, (await SystemConfigModel.findById(rule.other).lean())?.value));
  const current = Number(value);
  if (rule.minSide ? current > other : current < other) {
    throw new AppError('VALIDATION_ERROR', 400, 'Số ngày hoàn tiền sớm nhất phải nhỏ hơn hoặc bằng muộn nhất', [
      { field: 'value', issue: `Phải ${rule.minSide ? '≤' : '≥'} ${other}` },
    ]);
  }
}

/** PUT /admin/system-configs/:key: kiểm tra kiểu theo khóa, lưu, ghi nhật ký trước/sau (AD-15, NF-A04). */
export async function updateSystemConfig(req: Request, key: string, rawValue: unknown) {
  const def = CONFIG_BY_KEY.get(key);
  if (!def) throw new AppError('NOT_FOUND', 404, 'Không có khóa cấu hình này');

  const parsed = def.schema.safeParse(rawValue);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Giá trị cấu hình không hợp lệ',
      parsed.error.issues.map((issue) => ({ field: ['value', ...issue.path].join('.'), issue: issue.message })),
    );
  }
  await assertCrossKeyRules(key, parsed.data);

  const before = await SystemConfigModel.findById(key).lean();
  await SystemConfigModel.updateOne(
    { _id: key },
    { $set: { value: parsed.data, description: def.label, updatedBy: new Types.ObjectId(req.user!.id) } },
    { upsert: true },
  );

  await recordAudit(req, {
    action: 'CONFIG_UPDATE',
    targetType: 'SYSTEM_CONFIG',
    targetId: key,
    oldValue: redactForAudit(withDefaults(def, before?.value)),
    newValue: parsed.data,
  });

  return { key, value: parsed.data };
}
