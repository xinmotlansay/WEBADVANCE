import { Types } from 'mongoose';
import { CategoryModel, type CategoryDoc, type CategoryType } from '../categories/category.model.js';
import { ProductModel } from '../products/product.model.js';
import { AppError } from '../../utils/app-error.js';
import type { CategoryInput } from './admin.schema.js';

/** Slug không dấu từ tên tiếng Việt: "Phòng khách" → "phong-khach". */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'danh-muc';
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await CategoryModel.exists({ slug }))) return slug;
  }
}

/** PA-07: toàn bộ danh mục ba loại, kèm số sản phẩm và nhóm đồ thường có (với loại phòng). */
export async function listCategories() {
  const [categories, counts] = await Promise.all([
    CategoryModel.find({ type: { $in: ['PRODUCT_CATEGORY', 'ROOM', 'STYLE'] } })
      .sort({ type: 1, name: 1 })
      .lean<(CategoryDoc & { updatedAt: Date })[]>(),
    ProductModel.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
      { $unwind: '$categoryIds' },
      {
        $group: {
          _id: '$categoryIds',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c]));
  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));
  return categories.map((c) => ({
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    type: c.type,
    description: c.description ?? '',
    image: c.image ?? '',
    status: c.status,
    parentId: c.parentId ? String(c.parentId) : null,
    typicalCategories: (c.typicalCategoryIds ?? [])
      .map((id) => ({ id: String(id), name: nameById.get(String(id)) ?? '' }))
      .filter((t) => t.name),
    productCount: countById.get(String(c._id))?.total ?? 0,
    activeProductCount: countById.get(String(c._id))?.active ?? 0,
    updatedAt: c.updatedAt,
  }));
}

/** Nhóm đồ của phòng phải là loại sản phẩm (FR-23 so khớp theo loại sản phẩm). */
async function assertTypical(type: CategoryType, ids: string[], selfId?: string): Promise<Types.ObjectId[]> {
  if (type !== 'ROOM' || !ids.length) return [];
  const unique = [...new Set(ids)].filter((id) => id !== selfId);
  const found = await CategoryModel.countDocuments({ _id: { $in: unique }, type: 'PRODUCT_CATEGORY' });
  if (found !== unique.length) {
    throw new AppError('VALIDATION_ERROR', 400, 'Nhóm đồ thường có trong phòng chỉ gồm các loại sản phẩm');
  }
  return unique.map((id) => new Types.ObjectId(id));
}

/** Danh mục cha chỉ áp dụng cho loại sản phẩm, phải là loại sản phẩm khác và không tạo vòng lặp. */
async function resolveParent(type: CategoryType, parentId: string | null | undefined, selfId?: Types.ObjectId): Promise<Types.ObjectId | null> {
  if (type !== 'PRODUCT_CATEGORY' || !parentId) return null;
  if (selfId && parentId === String(selfId)) throw new AppError('VALIDATION_ERROR', 400, 'Danh mục không thể là cha của chính nó');
  const parent = await CategoryModel.findById(parentId).lean();
  if (!parent || parent.type !== 'PRODUCT_CATEGORY') {
    throw new AppError('VALIDATION_ERROR', 400, 'Danh mục cha phải là một loại sản phẩm');
  }
  for (let cur = parent, depth = 0; cur.parentId && depth < 20; depth++) {
    if (selfId && String(cur.parentId) === String(selfId)) {
      throw new AppError('VALIDATION_ERROR', 400, 'Không thể chọn danh mục con làm danh mục cha');
    }
    const next = await CategoryModel.findById(cur.parentId).lean();
    if (!next) break;
    cur = next;
  }
  return parent._id as Types.ObjectId;
}

async function assertNameFree(type: CategoryType, name: string, exceptId?: Types.ObjectId): Promise<void> {
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const taken = await CategoryModel.exists({ type, name: pattern, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (taken) throw new AppError('CONFLICT', 409, `Đã có danh mục "${name}" cùng loại, chọn tên khác`);
}

export async function createCategory(input: CategoryInput) {
  if (!input.type) throw new AppError('VALIDATION_ERROR', 400, 'Chọn loại danh mục');
  await assertNameFree(input.type, input.name);
  const category = await CategoryModel.create({
    name: input.name,
    slug: await uniqueSlug(input.name),
    type: input.type,
    description: input.description,
    image: input.image,
    status: input.status,
    typicalCategoryIds: await assertTypical(input.type, input.typicalCategoryIds),
    parentId: await resolveParent(input.type, input.parentId),
  });
  return { id: String(category._id), name: category.name };
}

/** PA-07: sửa tên, mô tả, ảnh, trạng thái, nhóm đồ của phòng. Loại và slug giữ nguyên để không gãy đường dẫn. */
export async function updateCategory(id: Types.ObjectId, input: CategoryInput) {
  const category = await CategoryModel.findById(id);
  if (!category) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy danh mục');
  if (input.name.toLowerCase() !== category.name.toLowerCase()) await assertNameFree(category.type, input.name, id);
  const before = { name: category.name, status: category.status };
  category.set({
    name: input.name,
    description: input.description,
    image: input.image,
    status: input.status,
    typicalCategoryIds: await assertTypical(category.type, input.typicalCategoryIds, String(id)),
    ...(input.parentId !== undefined ? { parentId: await resolveParent(category.type, input.parentId, id) } : {}),
  });
  await category.save();
  return { id: String(category._id), name: category.name, before };
}

export async function setCategoryStatus(id: Types.ObjectId, status: 'VISIBLE' | 'HIDDEN') {
  const category = await CategoryModel.findById(id);
  if (!category) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy danh mục');
  const before = category.status;
  category.status = status;
  await category.save();
  return { id: String(category._id), name: category.name, before, status };
}
