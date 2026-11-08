import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { slugify } from '../../utils/slug.js';
import { ShowroomModel, type ShowroomDoc } from '../showrooms/showroom.model.js';
import { recordAudit } from './audit-log.service.js';
import type { ShowroomInput } from './showroom-admin.schema.js';

type ShowroomRow = Pick<
  ShowroomDoc,
  'name' | 'slug' | 'city' | 'region' | 'address' | 'phone' | 'openTime' | 'closeTime' | 'latitude' | 'longitude' | 'image' | 'isFlagship' | 'displayOrder' | 'status'
> & { _id: Types.ObjectId };

function view(s: ShowroomRow) {
  return {
    id: s._id.toString(),
    name: s.name,
    slug: s.slug,
    city: s.city,
    region: s.region,
    address: s.address,
    phone: s.phone ?? '',
    openTime: s.openTime,
    closeTime: s.closeTime,
    latitude: s.latitude,
    longitude: s.longitude,
    image: s.image,
    isFlagship: s.isFlagship,
    displayOrder: s.displayOrder,
    status: s.status,
  };
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || 'showroom';
  for (let n = 0; ; n++) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await ShowroomModel.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
    if (!clash) return slug;
  }
}

/** Chỉ một showroom chủ lực: bản đồ bên khách vẽ đường nối từ điểm đó. */
async function clearOtherFlagships(keepId: string): Promise<void> {
  await ShowroomModel.updateMany({ _id: { $ne: keepId }, isFlagship: true }, { $set: { isFlagship: false } });
}

export async function listShowrooms() {
  const rows = await ShowroomModel.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
  return rows.map(view);
}

export async function createShowroom(req: Request, input: ShowroomInput) {
  const created = await ShowroomModel.create({ ...input, slug: await uniqueSlug(input.name) });
  if (input.isFlagship) await clearOtherFlagships(created.id);
  const result = view(created.toObject());
  await recordAudit(req, { action: 'SHOWROOM_CREATE', targetType: 'SHOWROOM', targetId: result.id, newValue: result });
  return result;
}

export async function updateShowroom(req: Request, id: string, input: ShowroomInput) {
  const before = await ShowroomModel.findById(id).lean();
  if (!before) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy cửa hàng');

  const slug = input.name === before.name ? before.slug : await uniqueSlug(input.name, id);
  const after = await ShowroomModel.findByIdAndUpdate(id, { $set: { ...input, slug } }, { new: true }).lean();
  if (input.isFlagship) await clearOtherFlagships(id);

  const result = view(after!);
  await recordAudit(req, { action: 'SHOWROOM_UPDATE', targetType: 'SHOWROOM', targetId: id, oldValue: view(before), newValue: result });
  return result;
}

export async function deleteShowroom(req: Request, id: string) {
  const before = await ShowroomModel.findByIdAndDelete(id).lean();
  if (!before) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy cửa hàng');
  await recordAudit(req, { action: 'SHOWROOM_DELETE', targetType: 'SHOWROOM', targetId: id, oldValue: view(before) });
  return { id };
}
