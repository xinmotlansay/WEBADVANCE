import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { InspirationModel, type InspirationDoc } from '../inspirations/inspiration.model.js';
import { ProductModel } from '../products/product.model.js';
import { logAdminAction } from './admin-log.js';
import { normalizeProductIds } from './collection-admin.rules.js';
import { checkInspirationPublishable, type InspirationInput, type UpdateInspirationInput } from './inspiration-admin.rules.js';

const conflict = () => new AppError('E-COM-05', 409, 'Ảnh cảm hứng vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy nguồn cảm hứng');

export const inspirationListQuerySchema = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']).optional() });
export type InspirationListQuery = z.infer<typeof inspirationListQuerySchema>;

type Doc = InspirationDoc & { updatedAt?: Date };

const orderedIds = (i: Pick<InspirationDoc, 'products'>) =>
  [...i.products].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => String(p.productId));

/** Sản phẩm không còn ACTIVE → cờ "Sản phẩm ngừng bán" (khách sẽ không thấy chúng trong popup). */
async function inactiveIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set();
  const active = new Set((await ProductModel.find({ _id: { $in: unique }, status: 'ACTIVE' }, '_id').lean()).map((p) => String(p._id)));
  return new Set(unique.filter((id) => !active.has(id)));
}

const toRow = (i: Doc, inactive: Set<string>) => {
  const productIds = orderedIds(i);
  return {
    id: String(i._id),
    imageUrl: i.imageUrl,
    productIds,
    productCount: productIds.length,
    inactiveProductIds: productIds.filter((id) => inactive.has(id)),
    status: i.status,
    scheduledAt: i.status === 'VISIBLE' && i.publishAt && i.publishAt > new Date() ? i.publishAt : null,
    displayOrder: i.displayOrder ?? 0,
    flags: productIds.some((id) => inactive.has(id)) ? ['INACTIVE_PRODUCT' as const] : [],
    version: i.version ?? 0,
    updatedAt: i.updatedAt,
  };
};

export async function listInspirations(q: InspirationListQuery) {
  const docs = (await InspirationModel.find(q.status ? { status: q.status } : {})
    .sort({ displayOrder: 1, _id: 1 })
    .lean()) as Doc[];
  const inactive = await inactiveIds(docs.flatMap(orderedIds));
  return docs.map((i) => toRow(i, inactive));
}

async function load(id: string): Promise<Doc> {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const i = (await InspirationModel.findById(id).lean()) as Doc | null;
  if (!i) throw notFound();
  return i;
}

export async function getInspiration(id: string) {
  const i = await load(id);
  return toRow(i, await inactiveIds(orderedIds(i)));
}

/** Sản phẩm mới chọn phải đang bán; sản phẩm đã có sẵn (có thể đã ngừng) được giữ để không mất dữ liệu. */
async function values(input: InspirationInput, existing: Doc | null) {
  const ids = normalizeProductIds(input.productIds);
  const kept = new Set(existing ? orderedIds(existing) : []);
  const fresh = ids.filter((id) => !kept.has(id));
  if (fresh.length && (await ProductModel.countDocuments({ _id: { $in: fresh }, status: 'ACTIVE' })) !== fresh.length) {
    throw new AppError('E-COM-01', 400, 'Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.');
  }
  return {
    imageUrl: input.imageUrl,
    products: ids.map((id, n) => ({ productId: new Types.ObjectId(id), displayOrder: n + 1 })),
  };
}

/** Tạo mới ở trạng thái Ẩn, đứng cuối lưới. */
export async function createInspiration(actorId: string, input: InspirationInput) {
  const set = await values(input, null);
  const last = await InspirationModel.findOne({}, 'displayOrder').sort({ displayOrder: -1 }).lean();
  const doc = await InspirationModel.create({ ...set, status: 'HIDDEN', displayOrder: (last?.displayOrder ?? 0) + 1 });
  logAdminAction(actorId, 'INSPIRATION_CREATED', String(doc._id), { products: set.products.length });
  return getInspiration(String(doc._id));
}

export async function updateInspiration(actorId: string, id: string, input: UpdateInspirationInput) {
  const existing = await load(id);
  if ((existing.version ?? 0) !== input.version) throw conflict();
  const set = await values(input, existing);
  if (existing.status === 'VISIBLE') checkInspirationPublishable(set.products.length);
  const res = await InspirationModel.updateOne(
    { _id: existing._id, version: existing.version ?? 0 },
    { $set: set, $inc: { version: 1 } },
  );
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, 'INSPIRATION_UPDATED', id, { products: set.products.length });
  return getInspiration(id);
}

export async function setInspirationHidden(actorId: string, id: string, hidden: boolean, publishAt?: Date | null) {
  const i = await load(id);
  if (!hidden) checkInspirationPublishable(i.products.length);
  await InspirationModel.updateOne(
    { _id: i._id },
    { $set: { status: hidden ? 'HIDDEN' : 'VISIBLE', publishAt: hidden ? null : (publishAt ?? new Date()) }, $inc: { version: 1 } },
  );
  logAdminAction(actorId, hidden ? 'INSPIRATION_HIDDEN' : 'INSPIRATION_SHOWN', id, {});
  return getInspiration(id);
}

/** Xóa cứng như Collection: phải ẩn trước. Ảnh đã tải lên giữ trên đĩa. */
export async function deleteInspiration(actorId: string, id: string) {
  const i = await load(id);
  if (i.status === 'VISIBLE') throw new AppError('E-MKT-021-03', 409, 'Vui lòng ẩn ảnh cảm hứng trước khi xóa.');
  await InspirationModel.deleteOne({ _id: i._id });
  logAdminAction(actorId, 'INSPIRATION_DELETED', id, { imageUrl: i.imageUrl }, true);
  return { deleted: 1 };
}

/** `ids` theo thứ tự mới, phải đủ mọi ảnh để `displayOrder` không bị trùng. */
export async function reorderInspirations(actorId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const total = await InspirationModel.countDocuments();
  const found = await InspirationModel.countDocuments({ _id: { $in: unique.filter((i) => Types.ObjectId.isValid(i)) } });
  if (unique.length !== ids.length || found !== ids.length || found !== total) {
    throw new AppError('VALIDATION_ERROR', 400, 'Danh sách sắp xếp không khớp. Vui lòng tải lại.');
  }
  await InspirationModel.bulkWrite(
    ids.map((id, n) => ({ updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { displayOrder: n + 1 }, $inc: { version: 1 } } } })),
  );
  logAdminAction(actorId, 'INSPIRATION_REORDER', 'inspirations', { ids });
  return { reordered: ids.length };
}
