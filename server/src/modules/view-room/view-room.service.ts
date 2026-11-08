import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { toObjectId } from '../../utils/object-id.js';
import { CategoryModel } from '../categories/category.model.js';
import { buildListItems, getProductDetail, type ProductListItem } from '../products/product.service.js';
import { ProductModel } from '../products/product.model.js';
import type { LayoutInput, SuggestionInput } from './view-room.schema.js';
import { ViewRoomLayoutModel, type ViewRoomLayoutDoc } from './view-room.model.js';

const SIMILAR_LIMIT = 8;
const MISSING_PER_GROUP = 12;

export interface MissingGroup {
  category: { id: string; name: string };
  products: ProductListItem[];
}

export interface RoomSuggestions {
  similar: ProductListItem[];
  missing: MissingGroup[];
}

/**
 * FR-23: "tương tự" là sản phẩm cùng loại sản phẩm với đồ đã đặt; "còn thiếu" là các nhóm
 * trong `typicalCategoryIds` của loại phòng mà chưa có đồ nào được đặt.
 * `roomSize` nhận sẵn nhưng chưa dùng để lọc, vì sản phẩm chưa có kích thước đầy đủ.
 */
export async function getRoomSuggestions(input: SuggestionInput): Promise<RoomSuggestions> {
  const room = await CategoryModel.findOne({
    _id: toObjectId(input.roomCategoryId),
    type: 'ROOM',
    status: 'VISIBLE',
  }).lean();
  if (!room) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy loại phòng');

  const placedIds = input.placedProductIds.map((id) => new Types.ObjectId(id));
  const placed = placedIds.length
    ? await ProductModel.find({ _id: { $in: placedIds }, status: 'ACTIVE' }).lean()
    : [];
  const excludeIds = placed.map((p) => p._id);

  const placedCategoryIds = [...new Set(placed.flatMap((p) => p.categoryIds.map(String)))].map(
    (id) => new Types.ObjectId(id),
  );
  const placedProductCategories = placedCategoryIds.length
    ? await CategoryModel.find(
        { _id: { $in: placedCategoryIds }, type: 'PRODUCT_CATEGORY' },
        { _id: 1 },
      ).lean()
    : [];
  const productCategoryIds = placedProductCategories.map((c) => c._id);

  const similarDocs = productCategoryIds.length
    ? await ProductModel.find({
        status: 'ACTIVE',
        _id: { $nin: excludeIds },
        categoryIds: { $in: productCategoryIds },
      })
        .sort({ listedAt: -1 })
        .limit(SIMILAR_LIMIT)
        .lean()
    : [];

  const coveredIds = new Set(productCategoryIds.map(String));
  const missingCategories = await CategoryModel.find({
    _id: { $in: room.typicalCategoryIds.filter((id) => !coveredIds.has(id.toString())) },
    type: 'PRODUCT_CATEGORY',
    status: 'VISIBLE',
  }).lean();

  // Chỉ gợi ý sản phẩm vừa thuộc nhóm còn thiếu vừa thuộc đúng loại phòng đang chọn.
  const missing = await Promise.all(
    missingCategories.map(async (category) => {
      const docs = await ProductModel.find({
        status: 'ACTIVE',
        _id: { $nin: excludeIds },
        categoryIds: { $all: [category._id, room._id] },
      })
        .sort({ listedAt: -1 })
        .limit(MISSING_PER_GROUP)
        .lean();
      return {
        category: { id: category._id.toString(), name: category.name },
        products: await buildListItems(docs),
      };
    }),
  );

  return {
    similar: await buildListItems(similarDocs),
    missing: missing.filter((group) => group.products.length > 0),
  };
}

export interface LayoutDto {
  id: string;
  name: string;
  roomCategoryId: string | null;
  room: ViewRoomLayoutDoc['room'];
  items: { productId: string; x: number; z: number; y: number; rotationY: number }[];
  updatedAt: Date;
}

function toLayoutDto(doc: ViewRoomLayoutDoc): LayoutDto {
  return {
    id: doc._id.toString(),
    name: doc.name,
    roomCategoryId: doc.roomCategoryId?.toString() ?? null,
    room: doc.room,
    items: doc.items.map((item) => ({
      productId: item.productId.toString(),
      x: item.x,
      z: item.z,
      y: item.y ?? 0,
      rotationY: item.rotationY,
    })),
    updatedAt: doc.updatedAt,
  };
}

export async function listLayouts(userId: string): Promise<LayoutDto[]> {
  const docs = await ViewRoomLayoutModel.find({ userId: toObjectId(userId) })
    .sort({ updatedAt: -1 })
    .lean();
  return docs.map(toLayoutDto);
}

const MAX_SAVED_LAYOUTS = 20;

async function assertProductsAvailable(input: LayoutInput): Promise<void> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  if (productIds.length === 0) return;
  const available = await ProductModel.countDocuments({
    _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    status: 'ACTIVE',
  });
  if (available !== productIds.length) {
    throw new AppError('VALIDATION_ERROR', 400, 'Có sản phẩm không còn bán');
  }
}

function layoutFields(input: LayoutInput) {
  return {
    name: input.name,
    roomCategoryId: input.roomCategoryId ? new Types.ObjectId(input.roomCategoryId) : undefined,
    room: input.room,
    items: input.items.map((item) => ({
      productId: new Types.ObjectId(item.productId),
      x: item.x,
      z: item.z,
      y: item.y ?? 0,
      rotationY: item.rotationY,
    })),
  };
}

export async function createLayout(userId: string, input: LayoutInput): Promise<LayoutDto> {
  const owner = toObjectId(userId);
  if ((await ViewRoomLayoutModel.countDocuments({ userId: owner })) >= MAX_SAVED_LAYOUTS) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      `Bạn chỉ lưu được tối đa ${MAX_SAVED_LAYOUTS} bố cục, hãy xóa bớt bố cục cũ`,
    );
  }
  await assertProductsAvailable(input);
  const doc = await ViewRoomLayoutModel.create({ userId: owner, ...layoutFields(input) });
  return toLayoutDto(doc.toObject());
}

/** Ghi đè bố cục đã lưu (lưu lại khi đang sửa một bố cục có sẵn). */
export async function updateLayout(
  userId: string,
  id: string,
  input: LayoutInput,
): Promise<LayoutDto> {
  await assertProductsAvailable(input);
  const doc = await ViewRoomLayoutModel.findOneAndUpdate(
    { _id: toObjectId(id), userId: toObjectId(userId) },
    { $set: layoutFields(input), ...(input.roomCategoryId ? {} : { $unset: { roomCategoryId: 1 } }) },
    { new: true },
  ).lean();
  if (!doc) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bố cục');
  return toLayoutDto(doc);
}

export interface LayoutDetailItem {
  productId: string;
  slug: string;
  name: string;
  priceFrom: number;
  model3DUrl: string | null;
  dimensions: { length: number; width: number; height: number; unit: string } | null;
  placement: 'FLOOR' | 'WALL';
  x: number;
  z: number;
  y: number;
  rotationY: number;
}

export interface LayoutDetailDto extends Omit<LayoutDto, 'items'> {
  items: LayoutDetailItem[];
  /** Số sản phẩm đã ngừng bán hoặc không còn mô hình 3D nên không đưa lại vào phòng. */
  skippedCount: number;
}

/** Mở một bố cục kèm thông tin sản phẩm đủ để dựng lại trong phòng 3D. */
export async function getLayoutDetail(userId: string, id: string): Promise<LayoutDetailDto> {
  const doc = await ViewRoomLayoutModel.findOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  }).lean();
  if (!doc) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bố cục');

  const ids = [...new Set(doc.items.map((item) => item.productId.toString()))];
  const products = await ProductModel.find({
    _id: { $in: ids.map((value) => new Types.ObjectId(value)) },
    status: 'ACTIVE',
  }).lean();
  const details = new Map<string, Awaited<ReturnType<typeof getProductDetail>>>();
  await Promise.all(
    products.map(async (product) => {
      try {
        details.set(product._id.toString(), await getProductDetail(product.slug));
      } catch {
        // Sản phẩm vừa bị gỡ: bỏ qua, đếm vào skippedCount.
      }
    }),
  );

  const items: LayoutDetailItem[] = [];
  for (const item of doc.items) {
    const detail = details.get(item.productId.toString());
    if (!detail?.has3DModel || !detail.model3DUrl) continue;
    items.push({
      productId: detail.id,
      slug: detail.slug,
      name: detail.name,
      priceFrom: detail.priceFrom,
      model3DUrl: detail.model3DUrl,
      dimensions: detail.dimensions,
      placement: detail.placement,
      x: item.x,
      z: item.z,
      y: item.y ?? 0,
      rotationY: item.rotationY,
    });
  }
  return { ...toLayoutDto(doc), items, skippedCount: doc.items.length - items.length };
}

export async function deleteLayout(userId: string, id: string): Promise<void> {
  const result = await ViewRoomLayoutModel.deleteOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
  });
  if (result.deletedCount === 0) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bố cục');
}
