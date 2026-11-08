import type { Types } from 'mongoose';
import { getRatingSummary } from '../reviews/review.service.js';
import { AppError } from '../../utils/app-error.js';
import { CategoryModel, type CategoryType } from '../categories/category.model.js';
import { CollectionModel } from '../collections/collection.model.js';
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
import { matchesSearch } from './search.service.js';

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
const DEFAULT_PRODUCT_THUMBNAIL =
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80';

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
      ?.url ?? DEFAULT_PRODUCT_THUMBNAIL
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

function matchesList(item: ProductListItem, variants: VariantDoc[], q: ProductListQuery): boolean {
  if (q.badge && !item.badges.includes(q.badge)) return false;
  if (q.hasPromotion && !item.hasPromotion) return false;
  if (q.inStock && item.stockStatus === 'OUT_OF_STOCK') return false;
  if (q.minPrice !== undefined && item.priceFrom < q.minPrice) return false;
  if (q.maxPrice !== undefined && item.priceFrom > q.maxPrice) return false;
  return variants.some(
    (v) =>
      v.status === 'ACTIVE' &&
      (!q.color || (!!v.color && q.color.includes(v.color))) &&
      (!q.material || (!!v.material && q.material.includes(v.material))) &&
      (['Length', 'Width', 'Height'] as const).every((axis) => {
        const min = q[`min${axis}`],
          max = q[`max${axis}`];
        const value = v.dimensions?.[axis.toLowerCase() as 'length' | 'width' | 'height'];
        return (
          (min === undefined || (value !== undefined && value >= min)) &&
          (max === undefined || (value !== undefined && value <= max))
        );
      }),
  );
}

interface ListEntry {
  item: ProductListItem;
  variants: VariantDoc[];
  listedAt: number;
  categoryIds: string[];
}

/** Tải mọi sản phẩm khớp ngữ cảnh tìm kiếm (từ khóa, danh mục, bộ sưu tập, ids), chưa lọc giá/nhãn. */
async function loadEntries(q: ProductListQuery): Promise<ListEntry[]> {
  const categoryFilter = await buildCategoryFilter(q.categoryIds ?? []);
  const collection = q.collection
    ? await CollectionModel.findOne({ slug: q.collection, status: 'VISIBLE' }, { products: 1 }).lean()
    : undefined;
  const conditions: object[] = [...categoryFilter];
  if (q.collection)
    conditions.push({ _id: { $in: collection?.products.map((p) => p.productId) ?? [] } });
  if (q.ids) conditions.push({ _id: { $in: q.ids } });
  let products = await ProductModel.find({
    status: 'ACTIVE',
    ...(conditions.length > 0 ? { $and: conditions } : {}),
  }).lean();

  if (q.q) {
    const variants = await VariantModel.find(
      { status: 'ACTIVE' },
      { productId: 1, sku: 1, color: 1, material: 1 },
    ).lean();
    const texts = new Map(
      products.map((product) => [
        product._id.toString(),
        [
          product.name,
          product.productCode,
          product.searchKeywords ?? '',
          product.shortDescription ?? '',
          ...variants
            .filter((v) => v.productId.equals(product._id))
            .flatMap((v) => [v.sku, v.color ?? '', v.material ?? '']),
        ].join(' '),
      ]),
    );
    const exact = products.filter((product) =>
      matchesSearch(q.q!, texts.get(product._id.toString())!, false),
    );
    products = exact.length
      ? exact
      : products.filter((product) => matchesSearch(q.q!, texts.get(product._id.toString())!));
  }

  // Quy mô đồ án (≤ 2.000 sản phẩm): lọc theo giá, nhãn, khuyến mãi và sắp xếp ở bộ nhớ vì giá
  // cuối cùng phụ thuộc khuyến mãi đang chạy.
  const now = new Date();
  const { variantsByProduct, promotionIndex } = await loadPricingContext(products, now);

  return products.flatMap((product) => {
    const variants = variantsByProduct.get(product._id.toString()) ?? [];
    const item = toListItem(product, variants, promotionIndex, now);
    return item
      ? [
          {
            item,
            variants,
            listedAt: product.listedAt?.getTime() ?? 0,
            categoryIds: product.categoryIds.map((id) => id.toString()),
          },
        ]
      : [];
  });
}

export async function listProducts(
  q: ProductListQuery,
): Promise<{ items: ProductListItem[]; total: number }> {
  const entries = await loadEntries(q);
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
  /** Giá thấp nhất sau khuyến mãi, trang View your Room dùng khi đặt vào phòng. */
  priceFrom: number;
  model3DUrl: string | null;
  placement: 'FLOOR' | 'WALL';
  dimensions: { length: number; width: number; height: number; unit: string } | null;
  parts: {
    name: string;
    description: string;
    quantity: number;
    image: string;
    isDetachable: boolean;
  }[];
  ratingSummary: Awaited<ReturnType<typeof getRatingSummary>>;
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
  const [item] = await buildListItems([product]);
  const model = product.media.find((m) => m.type === 'MODEL_3D');
  const size = variants.find(
    (v) => v.dimensions?.length && v.dimensions.width && v.dimensions.height,
  );

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
    has3DModel: !!model,
    priceFrom: item?.priceFrom ?? 0,
    model3DUrl: model?.url ?? null,
    placement: product.placement ?? 'FLOOR',
    dimensions: size?.dimensions
      ? {
          length: size.dimensions.length ?? 0,
          width: size.dimensions.width ?? 0,
          height: size.dimensions.height ?? 0,
          unit: size.dimensions.unit,
        }
      : null,
    parts: [...(product.parts ?? [])]
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((p) => ({
        name: p.name,
        description: p.description ?? '',
        quantity: p.quantity,
        image: p.image ?? '',
        isDetachable: p.isDetachable,
      })),
    ratingSummary: await getRatingSummary(product._id),
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


export interface ProductFacets {
  total: number;
  categoryIds: { id: string; count: number }[];
  colors: { value: string; count: number }[];
  materials: { value: string; count: number }[];
  price: { min: number; max: number };
  length: { min: number; max: number } | null;
  inStock: number;
  hasPromotion: number;
  badges: { NEW: number; BEST_SELLER: number };
}

function countValues(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

/**
 * Đặc tính có thật trong các sản phẩm của ngữ cảnh tìm kiếm hiện tại (từ khóa, ids, bộ sưu tập,
 * khuyến mãi cố định, danh mục đang chọn). Không áp giá, màu... người dùng đang chọn để thanh giá
 * không co lại khi kéo. Riêng danh sách danh mục bỏ qua danh mục đang chọn để vẫn đổi ý được.
 */
export async function getProductFacets(q: ProductListQuery): Promise<ProductFacets> {
  const context: ProductListQuery = {
    sort: 'newest',
    page: 1,
    limit: 100,
    q: q.q,
    collection: q.collection,
    ids: q.ids,
    hasPromotion: q.hasPromotion,
  };
  const load = async (query: ProductListQuery) =>
    (await loadEntries(query))
      .filter((e) => matchesList(e.item, e.variants, query))
      .map((e) => ({ ...e, variants: e.variants.filter((v) => v.status === 'ACTIVE') }));

  const selected = q.categoryIds?.length ?? 0;
  const forCategories = await load(context);
  const active = selected ? await load({ ...context, categoryIds: q.categoryIds }) : forCategories;
  const prices = active.map((e) => e.item.priceFrom);
  const lengths = active.flatMap((e) =>
    e.variants.map((v) => v.dimensions?.length).filter((n): n is number => typeof n === 'number'),
  );
  return {
    total: active.length,
    categoryIds: countValues(forCategories.flatMap((e) => e.categoryIds)).map(({ value, count }) => ({
      id: value,
      count,
    })),
    colors: countValues(
      active.flatMap((e) => [...new Set(e.variants.map((v) => v.color).filter((c): c is string => !!c))]),
    ),
    materials: countValues(
      active.flatMap((e) => [...new Set(e.variants.map((v) => v.material).filter((m): m is string => !!m))]),
    ),
    price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    length: lengths.length ? { min: Math.min(...lengths), max: Math.max(...lengths) } : null,
    inStock: active.filter((e) => e.item.stockStatus !== 'OUT_OF_STOCK').length,
    hasPromotion: active.filter((e) => e.item.hasPromotion).length,
    badges: {
      NEW: active.filter((e) => e.item.badges.includes('NEW')).length,
      BEST_SELLER: active.filter((e) => e.item.badges.includes('BEST_SELLER')).length,
    },
  };
}
