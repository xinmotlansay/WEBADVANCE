import mongoose, { Types, type PipelineStage } from 'mongoose';
import {
  ProductModel,
  type MediaPurpose,
  type ProductDoc,
  type ProductStatus,
} from '../products/product.model.js';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import { StockHistoryModel } from '../products/stock-history.model.js';
import { CategoryModel } from '../categories/category.model.js';
import { pickThumbnail } from '../products/product.service.js';
import { AppError } from '../../utils/app-error.js';
import type { ProductInput } from './admin.schema.js';

export type StockState = 'OK' | 'LOW' | 'OUT';

export interface AdminProductQuery {
  q?: string;
  status?: ProductStatus[];
  categoryId?: string;
  roomId?: string;
  stock?: StockState;
  sort: 'name' | '-updatedAt' | 'price' | '-price' | 'stock';
  page: number;
  limit: number;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stockStateOf(variants: Pick<VariantDoc, 'stockQuantity' | 'lowStockThreshold' | 'status'>[]): StockState {
  const active = variants.filter((v) => v.status === 'ACTIVE');
  if (!active.length || active.every((v) => v.stockQuantity === 0)) return 'OUT';
  return active.some((v) => v.stockQuantity <= v.lowStockThreshold) ? 'LOW' : 'OK';
}

/** Điều kiện chuyển sang Đang bán (PA-04): có ảnh, giá, cấp vận chuyển và kích thước kiện. */
export function missingForActive(product: Pick<ProductDoc, 'media'>, variants: VariantDoc[]): string[] {
  const missing: string[] = [];
  const active = variants.filter((v) => v.status === 'ACTIVE');
  if (!(product.media ?? []).some((m) => m.type === 'IMAGE')) missing.push('Chưa có ảnh sản phẩm');
  if (!active.length) missing.push('Chưa có biến thể đang bán');
  if (active.some((v) => !(v.salePrice > 0))) missing.push('Có biến thể chưa có giá bán');
  if (active.some((v) => !v.shippingTier)) missing.push('Có biến thể chưa có cấp vận chuyển');
  if (active.some((v) => !v.packages?.length)) missing.push('Có biến thể chưa có kích thước kiện');
  return missing;
}

/** PA-03: danh sách sản phẩm kèm giá thấp nhất, tổng tồn, cấp vận chuyển cao nhất. */
export async function listProducts(query: AdminProductQuery) {
  const match: Record<string, unknown> = {};
  if (query.status?.length) match['status'] = { $in: query.status };
  const categoryIds = [query.categoryId, query.roomId].filter((id): id is string => !!id);
  if (categoryIds.length) match['categoryIds'] = { $all: categoryIds.map((id) => new Types.ObjectId(id)) };

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'product_variants',
        localField: '_id',
        foreignField: 'productId',
        as: 'variants',
        pipeline: [
          {
            $project: {
              sku: 1,
              salePrice: 1,
              stockQuantity: 1,
              lowStockThreshold: 1,
              shippingTier: 1,
              status: 1,
            },
          },
        ],
      },
    },
  ];
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    pipeline.push({
      $match: { $or: [{ name: pattern }, { productCode: pattern }, { 'variants.sku': pattern }] },
    });
  }
  pipeline.push({
    $addFields: {
      activeVariants: { $filter: { input: '$variants', cond: { $eq: ['$$this.status', 'ACTIVE'] } } },
    },
  });
  pipeline.push({
    $addFields: {
      priceFrom: { $min: '$activeVariants.salePrice' },
      totalStock: { $sum: '$activeVariants.stockQuantity' },
      maxTier: { $max: '$variants.shippingTier' },
      stockState: {
        $switch: {
          branches: [
            {
              case: {
                $or: [
                  { $eq: [{ $size: '$activeVariants' }, 0] },
                  { $eq: [{ $sum: '$activeVariants.stockQuantity' }, 0] },
                ],
              },
              then: 'OUT',
            },
            {
              case: {
                $anyElementTrue: {
                  $map: {
                    input: '$activeVariants',
                    in: { $lte: ['$$this.stockQuantity', '$$this.lowStockThreshold'] },
                  },
                },
              },
              then: 'LOW',
            },
          ],
          default: 'OK',
        },
      },
    },
  });
  if (query.stock) pipeline.push({ $match: { stockState: query.stock } });
  const sortField = { name: 'name', '-updatedAt': 'updatedAt', price: 'priceFrom', '-price': 'priceFrom', stock: 'totalStock' }[query.sort];
  const direction = query.sort.startsWith('-') ? -1 : 1;
  pipeline.push(
    { $sort: { [sortField]: direction, _id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        total: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await ProductModel.aggregate<{
    rows: (ProductDoc & {
      variants: VariantDoc[];
      priceFrom: number | null;
      totalStock: number;
      maxTier: number | null;
      stockState: StockState;
    })[];
    total: { count: number }[];
  }>(pipeline);
  const categories = await CategoryModel.find({
    _id: { $in: result.rows.flatMap((row) => row.categoryIds) },
  })
    .select('name type')
    .lean();
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));
  const total = result.total[0]?.count ?? 0;

  return {
    data: result.rows.map((row) => {
      const cats = row.categoryIds.map((id) => categoryById.get(String(id))).filter(Boolean);
      return {
        id: String(row._id),
        name: row.name,
        slug: row.slug,
        productCode: row.productCode,
        thumbnail: pickThumbnail(row),
        category: cats.find((c) => c!.type === 'PRODUCT_CATEGORY')?.name ?? null,
        rooms: cats.filter((c) => c!.type === 'ROOM').map((c) => c!.name),
        status: row.status,
        shippingTier: row.maxTier ?? null,
        priceFrom: row.priceFrom ?? null,
        totalStock: row.totalStock,
        variantCount: row.variants.length,
        stockState: row.stockState,
        updatedAt: (row as unknown as { updatedAt: Date }).updatedAt,
      };
    }),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/** PA-03: chi tiết cho popup (biến thể, kiện hàng, ảnh & 3D, điều kiện lên kệ). */
export async function getProduct(productId: Types.ObjectId) {
  const product = await ProductModel.findById(productId).lean<ProductDoc>();
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');
  const [variants, categories] = await Promise.all([
    VariantModel.find({ productId }).sort({ sku: 1 }).lean<VariantDoc[]>(),
    CategoryModel.find({ _id: { $in: product.categoryIds } }).select('name type').lean(),
  ]);
  const installation = variants.find((v) => v.installationService !== 'NONE');
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    productCode: product.productCode,
    status: product.status,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    searchKeywords: product.searchKeywords ?? '',
    tags: product.tags ?? [],
    seo: { title: product.seo?.title ?? '', description: product.seo?.description ?? '' },
    warrantyMonths: product.warrantyMonths,
    warrantyTerms: product.warrantyTerms ?? '',
    parts: (product.parts ?? []).map((part) => ({
      id: String(part._id),
      name: part.name,
      quantity: part.quantity,
      isDetachable: part.isDetachable,
    })),
    thumbnail: pickThumbnail(product),
    categories: categories.map((c) => ({ id: String(c._id), name: c.name, type: c.type })),
    installation: installation
      ? { service: installation.installationService, fee: installation.installationFee ?? 0 }
      : null,
    stockState: stockStateOf(variants),
    variants: variants.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      color: v.color ?? '',
      material: v.material ?? '',
      originalPrice: v.originalPrice,
      salePrice: v.salePrice,
      stockQuantity: v.stockQuantity,
      lowStockThreshold: v.lowStockThreshold,
      shippingTier: v.shippingTier ?? null,
      status: v.status,
      dimensions: {
        length: v.dimensions?.length ?? null,
        width: v.dimensions?.width ?? null,
        height: v.dimensions?.height ?? null,
      },
      weight: v.weight ?? null,
      installationService: v.installationService ?? 'NONE',
      installationFee: v.installationFee ?? 0,
      packages: (v.packages ?? []).map((p) => ({
        index: p.index,
        name: p.name ?? `Kiện ${p.index}`,
        length: p.length,
        width: p.width,
        height: p.height,
        weight: p.weight,
      })),
    })),
    media: (product.media ?? [])
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((m) => ({ type: m.type, url: m.url, purpose: m.purpose ?? null })),
    missingForActive: missingForActive(product, variants),
  };
}

/** PA-04, PA-06: đổi trạng thái. Lên kệ phải đủ điều kiện; lần đầu lên kệ ghi `listedAt`. */
export async function setProductStatus(productId: Types.ObjectId, status: ProductStatus) {
  const product = await ProductModel.findById(productId);
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');
  const before = product.status;
  if (status === 'ACTIVE') {
    const variants = await VariantModel.find({ productId }).lean<VariantDoc[]>();
    const missing = missingForActive(product, variants);
    if (missing.length) {
      throw new AppError('PRODUCT_INCOMPLETE', 409, `${product.name}: chưa đủ điều kiện lên kệ`, missing);
    }
    product.listedAt ??= new Date();
  }
  product.status = status;
  await product.save();
  return { id: String(product._id), name: product.name, before, status };
}

export interface StockAdjustment {
  changeType: 'IMPORT' | 'STOCKTAKE' | 'ADJUSTMENT';
  quantity: number;
  note?: string;
}

/** PA-08 (API Design 10.2): nhập/kiểm kê/điều chỉnh tồn kho, không để tồn âm, ghi lịch sử. */
export async function adjustStock(
  variantId: Types.ObjectId,
  body: StockAdjustment,
  adminId: Types.ObjectId,
) {
  return mongoose.connection.transaction(async (session) => {
    const variant = await VariantModel.findById(variantId).session(session);
    if (!variant) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy biến thể');
    const before = variant.stockQuantity;
    const after =
      body.changeType === 'STOCKTAKE'
        ? body.quantity
        : before + (body.changeType === 'IMPORT' ? Math.abs(body.quantity) : body.quantity);
    if (after < 0) {
      throw new AppError('INSUFFICIENT_STOCK', 409, `Tồn kho ${variant.sku} không được âm (hiện có ${before})`);
    }
    variant.stockQuantity = after;
    await variant.save({ session });
    await StockHistoryModel.create(
      [
        {
          variantId,
          changeType: body.changeType,
          quantityChange: after - before,
          quantityAfter: after,
          performedBy: adminId,
          note: body.note,
          performedAt: new Date(),
        },
      ],
      { session },
    );
    return {
      variantId: String(variant._id),
      sku: variant.sku,
      before,
      after,
      lowStock: after <= variant.lowStockThreshold,
    };
  });
}

/** Danh mục và phòng cho bộ lọc (PA-07, cả danh mục ẩn). */
export async function listCategoryOptions() {
  const categories = await CategoryModel.find({ type: { $in: ['PRODUCT_CATEGORY', 'ROOM', 'STYLE'] } })
    .select('name type status')
    .sort({ name: 1 })
    .lean();
  return categories.map((c) => ({ id: String(c._id), name: c.name, type: c.type, status: c.status }));
}

/** Slug không dấu từ tên tiếng Việt: "Sofa Linen 3 chỗ" → "sofa-linen-3-cho". */
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

async function uniqueSlug(name: string, exceptId?: Types.ObjectId): Promise<string> {
  const base = slugify(name) || 'san-pham';
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ProductModel.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
    if (!taken) return slug;
  }
}

/** PPP tiếp theo trong dãy AAA (requirements 1.1): lớn nhất hiện có + 1, không tái sử dụng. */
async function nextProductCode(range: string): Promise<string> {
  const latest = await ProductModel.findOne({ productCode: new RegExp(`^${range}\\.\\d{3}$`) })
    .sort({ productCode: -1 })
    .select('productCode')
    .lean();
  const next = latest ? Number(latest.productCode.split('.')[1]) + 1 : 1;
  if (next > 999) {
    throw new AppError('SKU_RANGE_FULL', 409, `Dãy ${range} đã dùng hết 999 mã, chọn dãy khác`);
  }
  return `${range}.${String(next).padStart(3, '0')}`;
}

function productFields(input: ProductInput) {
  return {
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    searchKeywords: input.searchKeywords,
    tags: input.tags,
    categoryIds: input.categoryIds.map((id) => new Types.ObjectId(id)),
    seo: input.seo,
    warrantyMonths: input.warrantyMonths,
    warrantyTerms: input.warrantyTerms,
    media: input.media.map((m, index) => ({
      variantId: null,
      type: m.type,
      url: m.url,
      displayOrder: index + 1,
      purpose: (m.type === 'IMAGE' ? (index === 0 ? 'MAIN' : 'LIFESTYLE') : 'MODEL') as MediaPurpose,
    })),
  };
}

function variantFields(v: ProductInput['variants'][number]) {
  return {
    color: v.color,
    material: v.material,
    dimensions: { ...v.dimensions, unit: 'cm' },
    weight: v.weight,
    originalPrice: v.originalPrice,
    salePrice: v.salePrice,
    lowStockThreshold: v.lowStockThreshold,
    shippingTier: v.shippingTier,
    installationService: v.installationService,
    installationFee: v.installationService === 'NONE' ? 0 : v.installationFee,
    packages: v.packages.map((p, index) => ({ ...p, index: index + 1, name: p.name || `Kiện ${index + 1}` })),
    status: v.status,
  };
}

async function assertCategories(ids: string[]): Promise<void> {
  const found = await CategoryModel.find({ _id: { $in: ids } }).select('type').lean();
  if (found.length !== new Set(ids).size) {
    throw new AppError('VALIDATION_ERROR', 400, 'Có danh mục không tồn tại');
  }
  if (!found.some((c) => c.type === 'PRODUCT_CATEGORY')) {
    throw new AppError('VALIDATION_ERROR', 400, 'Chọn loại sản phẩm (danh mục chính)');
  }
}

function openingStock(variantId: Types.ObjectId, quantity: number, adminId: Types.ObjectId, note: string) {
  return {
    variantId,
    changeType: 'IMPORT' as const,
    quantityChange: quantity,
    quantityAfter: quantity,
    performedBy: adminId,
    note,
    performedAt: new Date(),
  };
}

/** PA-04: tạo sản phẩm nháp; hệ thống tự cấp `AAA.PPP` và `AAA.PPP.VV`, ghi tồn ban đầu vào lịch sử. */
export async function createProduct(input: ProductInput, adminId: Types.ObjectId) {
  const range = input.skuRange;
  if (!range) throw new AppError('VALIDATION_ERROR', 400, 'Chọn dãy cấp phát SKU (3 chữ số)');
  await assertCategories(input.categoryIds);
  for (let attempt = 0; attempt < 3; attempt++) {
    const productCode = await nextProductCode(range);
    try {
      return await mongoose.connection.transaction(async (session) => {
        const [product] = await ProductModel.create(
          [
            {
              ...productFields(input),
              slug: await uniqueSlug(input.name),
              productCode,
              status: 'DRAFT',
              parts: input.parts.map((part, index) => ({ ...part, displayOrder: index + 1 })),
            },
          ],
          { session },
        );
        const variants = await VariantModel.create(
          input.variants.map((v, index) => ({
            ...variantFields(v),
            productId: product._id,
            sku: `${productCode}.${String(index + 1).padStart(2, '0')}`,
            stockQuantity: v.stockQuantity,
          })),
          { session, ordered: true },
        );
        const opening = variants.filter((v) => v.stockQuantity > 0);
        if (opening.length) {
          await StockHistoryModel.create(
            opening.map((v) => openingStock(v._id, v.stockQuantity, adminId, 'Tồn kho ban đầu khi tạo sản phẩm')),
            { session, ordered: true },
          );
        }
        return { id: String(product._id), name: product.name, productCode };
      });
    } catch (error) {
      // Trùng mã do tạo đồng thời: thử lại với PPP mới (API Design 10.1).
      if ((error as { code?: number }).code === 11000 && attempt < 2) continue;
      throw error;
    }
  }
  throw new AppError('CONFLICT', 409, 'Không cấp được mã SKU, thử lại');
}

/** PA-05: sửa thông tin chung, biến thể (biến thể mới tự cấp VV), kiện, ảnh. Mã SKU và tồn kho không sửa ở đây. */
export async function updateProduct(productId: Types.ObjectId, input: ProductInput, adminId: Types.ObjectId) {
  const product = await ProductModel.findById(productId);
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');
  await assertCategories(input.categoryIds);
  const existing = await VariantModel.find({ productId }).lean<VariantDoc[]>();
  const existingIds = new Set(existing.map((v) => String(v._id)));
  if (input.variants.some((v) => v.id && !existingIds.has(v.id))) {
    throw new AppError('VALIDATION_ERROR', 400, 'Có biến thể không thuộc sản phẩm này');
  }
  let nextVv = Math.max(0, ...existing.map((v) => Number(v.sku.split('.')[2]) || 0)) + 1;
  if (nextVv - 1 + input.variants.filter((v) => !v.id).length > 99) {
    throw new AppError('VALIDATION_ERROR', 400, 'Mỗi sản phẩm tối đa 99 biến thể');
  }
  const before = { name: product.name, status: product.status };

  await mongoose.connection.transaction(async (session) => {
    product.set(productFields(input));
    if (before.name !== input.name) product.slug = await uniqueSlug(input.name, productId);
    const keptParts = new Set((product.parts ?? []).map((part) => String(part._id)));
    product.set(
      'parts',
      input.parts.map((part, index) => ({
        ...(part.id && keptParts.has(part.id) ? { _id: new Types.ObjectId(part.id) } : {}),
        name: part.name,
        quantity: part.quantity,
        isDetachable: part.isDetachable,
        displayOrder: index + 1,
      })),
    );
    await product.save({ session });

    for (const v of input.variants) {
      if (v.id) {
        await VariantModel.updateOne({ _id: v.id, productId }, { $set: variantFields(v) }, { session });
        continue;
      }
      const [created] = await VariantModel.create(
        [
          {
            ...variantFields(v),
            productId,
            sku: `${product.productCode}.${String(nextVv++).padStart(2, '0')}`,
            stockQuantity: v.stockQuantity,
          },
        ],
        { session },
      );
      if (created.stockQuantity > 0) {
        await StockHistoryModel.create(
          [openingStock(created._id, created.stockQuantity, adminId, 'Tồn kho ban đầu khi thêm biến thể')],
          { session },
        );
      }
    }
  });
  return { id: String(product._id), name: product.name, before };
}
