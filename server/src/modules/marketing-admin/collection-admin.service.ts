import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { CollectionModel, type CollectionDoc } from '../collections/collection.model.js';
import { ProductModel } from '../products/product.model.js';
import { logAdminAction } from './admin-log.js';
import { slugify } from './article-admin.rules.js';
import {
  checkDeletable,
  checkPublishable,
  isValidCollectionSlug,
  normalizeProductIds,
  type CreateCollectionInput,
  type UpdateCollectionInput,
} from './collection-admin.rules.js';

const conflict = () => new AppError('E-COM-05', 409, 'Bộ sưu tập vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy bộ sưu tập');
const slugTaken = () => new AppError('E-MKT-020-01', 409, 'Đường dẫn bộ sưu tập đã tồn tại hoặc không hợp lệ.');

export const listQuerySchema = z.object({
  status: z.enum(['VISIBLE', 'HIDDEN']).optional(),
  q: z.string().trim().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

type Doc = CollectionDoc & { updatedAt?: Date };

/** Mọi productId mà khách có thể thấy: danh sách + hotspot. */
const productIdsOf = (c: Pick<CollectionDoc, 'products' | 'images'>) => [
  ...c.products.map((p) => String(p.productId)),
  ...c.images.flatMap((i) => i.hotspots.map((h) => String(h.productId))),
];

/** Sản phẩm không còn ACTIVE → cờ "Sản phẩm ngừng bán" (khách sẽ không thấy chúng). */
async function inactiveIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set();
  const active = new Set((await ProductModel.find({ _id: { $in: unique }, status: 'ACTIVE' }, '_id').lean()).map((p) => String(p._id)));
  return new Set(unique.filter((id) => !active.has(id)));
}

const sortedImages = (c: Pick<CollectionDoc, 'images'>) => [...c.images].sort((a, b) => a.displayOrder - b.displayOrder);
const thumbnailOf = (c: Pick<CollectionDoc, 'images'>) => {
  const images = sortedImages(c);
  return (images.find((i) => i.isThumbnail) ?? images[0])?.url ?? null;
};

const toRow = (c: Doc, inactive: Set<string>) => ({
  id: String(c._id),
  name: c.name,
  slug: c.slug,
  slogan: c.slogan ?? '',
  thumbnail: thumbnailOf(c),
  imageCount: c.images.length,
  productCount: c.products.length,
  status: c.status,
  displayOrder: c.displayOrder,
  flags: productIdsOf(c).some((id) => inactive.has(id)) ? ['INACTIVE_PRODUCT' as const] : [],
  version: c.version ?? 0,
  updatedAt: c.updatedAt,
});

export async function listCollections(q: ListQuery) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter['status'] = q.status;
  if (q.q) {
    const re = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter['$or'] = [{ name: re }, { slug: re }];
  }
  const docs = (await CollectionModel.find(filter).sort({ displayOrder: 1, _id: 1 }).lean()) as Doc[];
  const inactive = await inactiveIds(docs.flatMap(productIdsOf));
  return docs.map((c) => toRow(c, inactive));
}

async function load(id: string): Promise<Doc> {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const c = (await CollectionModel.findById(id).lean()) as Doc | null;
  if (!c) throw notFound();
  return c;
}

/** Dữ liệu cho màn sửa: đủ field form, `productIds` theo thứ tự hiển thị. */
export async function getCollection(id: string) {
  const c = await load(id);
  const inactive = await inactiveIds(productIdsOf(c));
  const ordered = [...c.products].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  return {
    ...toRow(c, inactive),
    shortDescription: c.shortDescription ?? '',
    description: c.description ?? '',
    productIds: ordered.map((p) => String(p.productId)),
    inactiveProductIds: [...inactive],
    images: sortedImages(c).map((i) => ({
      id: String(i._id),
      url: i.url,
      title: i.title ?? '',
      description: i.description ?? '',
      isThumbnail: i.isThumbnail,
      hotspots: i.hotspots.map((h) => ({ productId: String(h.productId), x: h.x, y: h.y })),
    })),
  };
}

const slugUsed = async (slug: string, exceptId?: Types.ObjectId) =>
  !!(await CollectionModel.exists({ slug, _id: { $ne: exceptId ?? null } }));

async function autoSlug(name: string, exceptId?: Types.ObjectId): Promise<string> {
  const base = slugify(name) || 'bo-suu-tap';
  for (let i = 1; ; i++) {
    const s = i === 1 ? base : `${base.slice(0, 150)}-${i}`;
    if (isValidCollectionSlug(s) && !(await slugUsed(s, exceptId))) return s;
  }
}

/** Sản phẩm mới chọn phải đang bán; sản phẩm đã có sẵn (có thể đã ngừng) được giữ để không mất dữ liệu. */
async function checkProducts(ids: string[], kept: Set<string>): Promise<void> {
  const fresh = ids.filter((id) => !kept.has(id));
  if (!fresh.length) return;
  const n = await ProductModel.countDocuments({ _id: { $in: fresh }, status: 'ACTIVE' });
  if (n !== fresh.length) throw new AppError('E-COM-01', 400, 'Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.');
}

async function values(input: CreateCollectionInput, existing: Doc | null) {
  const productIds = normalizeProductIds(input.productIds);
  await checkProducts(productIds, new Set(existing?.products.map((p) => String(p.productId)) ?? []));

  let slug: string;
  if (input.slug) {
    if (!isValidCollectionSlug(input.slug) || (await slugUsed(input.slug, existing?._id))) throw slugTaken();
    slug = input.slug;
  } else {
    slug = existing?.slug ?? (await autoSlug(input.name));
  }
  return {
    name: input.name,
    slug,
    slogan: input.slogan,
    shortDescription: input.shortDescription,
    description: input.description,
    products: productIds.map((id, i) => ({ productId: new Types.ObjectId(id), displayOrder: i + 1 })),
  };
}

/** Tạo mới ở trạng thái Ẩn, đứng cuối danh sách. */
export async function createCollection(actorId: string, input: CreateCollectionInput) {
  const set = await values(input, null);
  const last = await CollectionModel.findOne({}, 'displayOrder').sort({ displayOrder: -1 }).lean();
  const doc = await CollectionModel.create({ ...set, status: 'HIDDEN', displayOrder: (last?.displayOrder ?? 0) + 1 });
  logAdminAction(actorId, 'COLLECTION_CREATED', String(doc._id), { slug: doc.slug });
  return getCollection(String(doc._id));
}

export async function updateCollection(actorId: string, id: string, input: UpdateCollectionInput) {
  const existing = await load(id);
  if ((existing.version ?? 0) !== input.version) throw conflict();
  const set = await values(input, existing);
  // Đang hiển thị thì không được làm rỗng.
  if (existing.status === 'VISIBLE') checkPublishable({ images: existing.images.length, products: set.products.length });
  const res = await CollectionModel.updateOne(
    { _id: existing._id, version: existing.version ?? 0 },
    { $set: set, $inc: { version: 1 } },
  );
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, 'COLLECTION_UPDATED', id, { slug: set.slug });
  return getCollection(id);
}

export async function setHidden(actorId: string, id: string, hidden: boolean) {
  const c = await load(id);
  if (!hidden) checkPublishable({ images: c.images.length, products: c.products.length });
  await CollectionModel.updateOne({ _id: c._id }, { $set: { status: hidden ? 'HIDDEN' : 'VISIBLE' }, $inc: { version: 1 } });
  logAdminAction(actorId, hidden ? 'COLLECTION_HIDDEN' : 'COLLECTION_SHOWN', id, { slug: c.slug });
  return getCollection(id);
}

/** Xóa cứng (user chốt 2026-11-05). Ảnh đã tải lên giữ trên đĩa. */
export async function deleteCollection(actorId: string, id: string) {
  const c = await load(id);
  checkDeletable(c.status);
  await CollectionModel.deleteOne({ _id: c._id });
  logAdminAction(actorId, 'COLLECTION_DELETED', id, { slug: c.slug, name: c.name }, true);
  return { deleted: 1 };
}

/** `ids` theo thứ tự mới, phải đủ mọi collection để `displayOrder` không bị trùng. */
export async function reorderCollections(actorId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const total = await CollectionModel.countDocuments();
  const found = await CollectionModel.countDocuments({ _id: { $in: unique.filter((i) => Types.ObjectId.isValid(i)) } });
  if (unique.length !== ids.length || found !== ids.length || found !== total) {
    throw new AppError('VALIDATION_ERROR', 400, 'Danh sách sắp xếp không khớp. Vui lòng tải lại.');
  }
  await CollectionModel.bulkWrite(
    ids.map((id, i) => ({ updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { displayOrder: i + 1 }, $inc: { version: 1 } } } })),
  );
  logAdminAction(actorId, 'COLLECTION_REORDER', 'collections', { ids });
  return { reordered: ids.length };
}
