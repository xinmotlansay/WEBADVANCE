import type { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { CategoryModel, type CategoryType } from '../categories/category.model.js';
import {
  buildPromotionIndex,
  calcPromotionDiscount,
  findRunningPromotions,
  resolvePromotion,
  type PromotionIndex,
} from '../promotions/promotion.service.js';
import { ProductModel, type ProductDoc } from './product.model.js';
import { VariantModel, type VariantDoc } from './variant.model.js';
import type { ProductListQuery } from './product.schema.js';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type Badge = 'NEW' | 'BEST_SELLER';

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  thumbnail: string;
  priceFrom: number;
  originalPriceFrom: number;
  hasPromotion: boolean;
  badges: Badge[];
  stockStatus: StockStatus;
  colors: string[];
  ratingAverage: number;
  ratingCount: number;
}

/** Số ngày nhãn Mới (system_configs `labels.newDays`, mặc định 30). */
const NEW_BADGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function variantStockStatus(variant: VariantDoc): StockStatus {
  if (variant.stockQuantity <= 0) return 'OUT_OF_STOCK';
  if (variant.stockQuantity <= variant.lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function productStockStatus(variants: VariantDoc[]): StockStatus {
  const statuses = variants.map(variantStockStatus);
  if (statuses.includes('IN_STOCK')) return 'IN_STOCK';
  if (statuses.includes('LOW_STOCK')) return 'LOW_STOCK';
  return 'OUT_OF_STOCK';
}

function resolveBadges(product: ProductDoc, now: Date): Badge[] {
  const badges: Badge[] = [];
  const { isNew, isBestSeller } = product.manualBadges ?? {};

  const autoNew =
    !!product.listedAt && now.getTime() - product.listedAt.getTime() <= NEW_BADGE_DAYS * DAY_MS;
  if (isNew === 'ON' || (isNew !== 'OFF' && autoNew)) badges.push('NEW');
  if (isBestSeller === 'ON' || (isBestSeller !== 'OFF' && product.isAutoBestSeller)) {
    badges.push('BEST_SELLER');
  }
  return badges;
}

export function pickThumbnail(product: ProductDoc): string {
  const images = product.media
    .filter((m) => m.type === 'IMAGE')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    (images.find((m) => m.purpose === 'MAIN') ?? images.find((m) => !m.variantId) ?? images[0])
      ?.url ?? ''
  );
}

function toListItem(
  product: ProductDoc,
  variants: VariantDoc[],
  promotions: PromotionIndex,
  now: Date,
): ProductListItem | null {
  const sellable = variants.filter((v) => v.status === 'ACTIVE');
  if (sellable.length === 0) return null;

  const applied = resolvePromotion(product._id, product.categoryIds, promotions);
  const priced = sellable.map((variant) => {
    const discount = applied ? calcPromotionDiscount(variant.salePrice, applied) : 0;
    return { variant, finalPrice: variant.salePrice - discount, discount };
  });
  const cheapest = priced.reduce((min, p) => (p.finalPrice < min.finalPrice ? p : min));

  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    thumbnail: pickThumbnail(product),
    priceFrom: cheapest.finalPrice,
    originalPriceFrom: cheapest.variant.originalPrice,
    hasPromotion: cheapest.discount > 0,
    badges: resolveBadges(product, now),
    stockStatus: productStockStatus(sellable),
    colors: [...new Set(sellable.map((v) => v.color).filter((c): c is string => !!c))],
    // Chưa có collection reviews nên chưa có điểm đánh giá.
    ratingAverage: 0,
    ratingCount: 0,
  };
}

interface PricingContext {
  variantsByProduct: Map<string, VariantDoc[]>;
  promotionIndex: PromotionIndex;
}

async function loadPricingContext(products: ProductDoc[], now: Date): Promise<PricingContext> {
  const [variants, promotions] = await Promise.all([
    VariantModel.find({ productId: { $in: products.map((p) => p._id) } }).lean(),
    findRunningPromotions(now),
  ]);

  const variantsByProduct = new Map<string, VariantDoc[]>();
  for (const variant of variants) {
    const key = variant.productId.toString();
    variantsByProduct.set(key, [...(variantsByProduct.get(key) ?? []), variant]);
  }
  return { variantsByProduct, promotionIndex: buildPromotionIndex(promotions) };
}

export async function buildListItems(
  products: ProductDoc[],
  now = new Date(),
): Promise<ProductListItem[]> {
  if (products.length === 0) return [];
  const { variantsByProduct, promotionIndex } = await loadPricingContext(products, now);

  return products.flatMap((product) => {
    const variants = variantsByProduct.get(product._id.toString()) ?? [];
    const item = toListItem(product, variants, promotionIndex, now);
    return item ? [item] : [];
  });
}

/** Cần lọc theo từng nhóm loại danh mục: OR trong cùng nhóm, AND giữa các nhóm khác loại. */
async function buildCategoryFilter(categoryIds: string[]): Promise<object[]> {
  if (categoryIds.length === 0) return [];
  const categories = await CategoryModel.find({ _id: { $in: categoryIds } }, { type: 1 }).lean();
  if (categories.length === 0) return [{ _id: { $in: [] } }];

  const byType = new Map<string, Types.ObjectId[]>();
  for (const category of categories) {
    byType.set(category.type, [...(byType.get(category.type) ?? []), category._id]);
  }
  return [...byType.values()].map((ids) => ({ categoryIds: { $in: ids } }));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesList(item: ProductListItem, variants: VariantDoc[], q: ProductListQuery): boolean {
  if (q.badge && !item.badges.includes(q.badge)) return false;
  if (q.hasPromotion && !item.hasPromotion) return false;
  if (q.inStock && item.stockStatus === 'OUT_OF_STOCK') return false;
  if (q.minPrice !== undefined && item.priceFrom < q.minPrice) return false;
  if (q.maxPrice !== undefined && item.priceFrom > q.maxPrice) return false;
  if (q.color && !variants.some((v) => v.color && q.color?.includes(v.color))) return false;
  if (q.material && !variants.some((v) => v.material && q.material?.includes(v.material))) {
    return false;
  }
  return true;
}

interface ListEntry {
  item: ProductListItem;
  variants: VariantDoc[];
  listedAt: number;
}

export async function listProducts(
  q: ProductListQuery,
): Promise<{ items: ProductListItem[]; total: number }> {
  const categoryFilter = await buildCategoryFilter(q.categoryIds ?? []);
  // ponytail: tìm bằng regex trên tên và từ khóa, đổi sang text index khi dữ liệu lớn.
  const keyword = q.q ? new RegExp(escapeRegex(q.q), 'i') : null;
  const products = await ProductModel.find({
    status: 'ACTIVE',
    ...(categoryFilter.length > 0 ? { $and: categoryFilter } : {}),
    ...(keyword ? { $or: [{ name: keyword }, { searchKeywords: keyword }] } : {}),
  }).lean();

  // Quy mô đồ án (≤ 2.000 sản phẩm): lọc theo giá, nhãn, khuyến mãi và sắp xếp ở bộ nhớ vì giá
  // cuối cùng phụ thuộc khuyến mãi đang chạy.
  const now = new Date();
  const { variantsByProduct, promotionIndex } = await loadPricingContext(products, now);

  const entries = products.flatMap((product) => {
    const variants = variantsByProduct.get(product._id.toString()) ?? [];
    const item = toListItem(product, variants, promotionIndex, now);
    return item ? [{ item, variants, listedAt: product.listedAt?.getTime() ?? 0 }] : [];
  });
  const filtered = entries.filter((e) => matchesList(e.item, e.variants, q));

  const sorters: Record<ProductListQuery['sort'], (a: ListEntry, b: ListEntry) => number> = {
    newest: (a, b) => b.listedAt - a.listedAt,
    price_asc: (a, b) => a.item.priceFrom - b.item.priceFrom,
    price_desc: (a, b) => b.item.priceFrom - a.item.priceFrom,
    name_asc: (a, b) => a.item.name.localeCompare(b.item.name, 'vi'),
    name_desc: (a, b) => b.item.name.localeCompare(a.item.name, 'vi'),
  };
  filtered.sort(sorters[q.sort]);

  const start = (q.page - 1) * q.limit;
  return {
    items: filtered.slice(start, start + q.limit).map((e) => e.item),
    total: filtered.length,
  };
}

export interface VariantPrice {
  original: number;
  sale: number;
  final: number;
  promotionId: string | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  productCode: string;
  shortDescription: string;
  description: string;
  thumbnail: string;
  badges: Badge[];
  tags: string[];
  categories: { id: string; name: string; slug: string; type: CategoryType }[];
  warranty: { months: number; terms: string };
  seo: { title?: string; description?: string };
  media: {
    variantId: string | null;
    type: string;
    url: string;
    displayOrder: number;
    purpose?: string;
  }[];
  has3DModel: boolean;
  parts: {
    name: string;
    description: string;
    quantity: number;
    image: string;
    isDetachable: boolean;
  }[];
  variants: {
    id: string;
    sku: string;
    color: string;
    material: string;
    dimensions: VariantDoc['dimensions'] | null;
    price: VariantPrice;
    stockStatus: StockStatus;
    shippingTier: number | null;
    installation: { service: VariantDoc['installationService']; fee: number };
  }[];
}

/** Giá cuối cùng của từng biến thể sau khuyến mãi đang chạy. */
export async function priceVariants(
  product: ProductDoc,
  variants: VariantDoc[],
  now = new Date(),
): Promise<Map<string, VariantPrice>> {
  const index = buildPromotionIndex(await findRunningPromotions(now));
  const applied = resolvePromotion(product._id, product.categoryIds, index);
  return new Map(
    variants.map((v) => {
      const discount = applied ? calcPromotionDiscount(v.salePrice, applied) : 0;
      const price: VariantPrice = {
        original: v.originalPrice,
        sale: v.salePrice,
        final: v.salePrice - discount,
        promotionId: discount > 0 && applied ? applied.promotion._id.toString() : null,
      };
      return [v._id.toString(), price];
    }),
  );
}

/**
 * FR-18, API Design 5.2. Chưa trả `shippingFee` (chờ module vận chuyển), `ratingSummary` và
 * `isWishlisted` (chờ module đánh giá và đăng nhập).
 */
export async function getProductDetail(slug: string): Promise<ProductDetail> {
  const product = await ProductModel.findOne({ slug, status: 'ACTIVE' }).lean();
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');

  const now = new Date();
  const [variants, categories] = await Promise.all([
    VariantModel.find({ productId: product._id, status: 'ACTIVE' }).lean(),
    CategoryModel.find({ _id: { $in: product.categoryIds }, status: 'VISIBLE' }).lean(),
  ]);
  const prices = await priceVariants(product, variants, now);

  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    productCode: product.productCode,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    thumbnail: pickThumbnail(product),
    badges: resolveBadges(product, now),
    tags: product.tags ?? [],
    categories: categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      type: c.type,
    })),
    warranty: { months: product.warrantyMonths, terms: product.warrantyTerms ?? '' },
    seo: product.seo ?? {},
    media: product.media.map((m) => ({
      variantId: m.variantId?.toString() ?? null,
      type: m.type,
      url: m.url,
      displayOrder: m.displayOrder,
      purpose: m.purpose,
    })),
    has3DModel: product.media.some((m) => m.type === 'MODEL_3D'),
    parts: [...(product.parts ?? [])]
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((p) => ({
        name: p.name,
        description: p.description ?? '',
        quantity: p.quantity,
        image: p.image ?? '',
        isDetachable: p.isDetachable,
      })),
    variants: variants.map((v) => ({
      id: v._id.toString(),
      sku: v.sku,
      color: v.color ?? '',
      material: v.material ?? '',
      dimensions: v.dimensions ?? null,
      price: prices.get(v._id.toString()) as VariantPrice,
      stockStatus: variantStockStatus(v),
      shippingTier: v.shippingTier ?? null,
      installation: { service: v.installationService, fee: v.installationFee ?? 0 },
    })),
  };
}
