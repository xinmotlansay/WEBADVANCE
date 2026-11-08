import { logger } from '../../lib/logger.js';
import { CollectionModel, type CollectionDoc } from '../collections/collection.model.js';
import { CategoryModel, type CategoryDoc } from '../categories/category.model.js';
import { ProductModel, type ProductDoc } from '../products/product.model.js';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import { ShowroomModel, type ShowroomDoc } from '../showrooms/showroom.model.js';
import type {
  GeminiChatCollection,
  GeminiChatProduct,
  GeminiChatShowroom,
  GeminiChatVariant,
} from '../../integrations/gemini.js';

export interface ChatCatalog {
  products: GeminiChatProduct[];
  showrooms: GeminiChatShowroom[];
  collections: GeminiChatCollection[];
}

const EMPTY_CATALOG: ChatCatalog = { products: [], showrooms: [], collections: [] };

/** Giới hạn dữ liệu catalog gửi sang AI để prompt không phình to bất thường. */
const MAX_PRODUCTS = 60;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { expiresAt: number; value: ChatCatalog } | null = null;
let inflight: Promise<ChatCatalog> | null = null;

export function clearChatCatalogCache(): void {
  cache = null;
  inflight = null;
}

function formatDimensions(dimensions?: VariantDoc['dimensions']): string | undefined {
  if (!dimensions) return undefined;
  const parts = [dimensions.length, dimensions.width, dimensions.height].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (parts.length === 0) return undefined;
  return `${parts.join('x')}${dimensions.unit || 'cm'}`;
}

function stockStatusOf(variants: GeminiChatVariant[]): string {
  const total = variants.reduce((sum, variant) => sum + variant.stockQuantity, 0);
  if (total <= 0) return 'Hết hàng';
  const low = variants.some((variant) => variant.stockQuantity > 0 && variant.stockQuantity <= 5);
  return low ? 'Sắp hết' : 'Còn hàng';
}

function toVariant(variant: VariantDoc): GeminiChatVariant {
  return {
    color: variant.color,
    material: variant.material,
    dimensions: formatDimensions(variant.dimensions),
    price: variant.salePrice,
    originalPrice: variant.originalPrice > variant.salePrice ? variant.originalPrice : undefined,
    stockQuantity: variant.stockQuantity,
    shippingTier: variant.shippingTier,
    installation:
      variant.installationService && variant.installationService !== 'NONE'
        ? variant.installationService
        : undefined,
  };
}

type CategoryLookup = Pick<CategoryDoc, 'name' | 'type'>;

function toProduct(
  product: ProductDoc,
  variants: VariantDoc[],
  categoryById: Map<string, CategoryLookup>,
): GeminiChatProduct {
  const mappedVariants = variants.map(toVariant);
  const prices = mappedVariants.map((variant) => variant.price).filter((price) => price > 0);
  const categories = product.categoryIds
    .map((id) => categoryById.get(String(id)))
    .filter((category): category is CategoryLookup => Boolean(category));
  const colors = [
    ...new Set(
      mappedVariants.map((variant) => variant.color).filter((color): color is string => !!color),
    ),
  ];
  const material = mappedVariants.find((variant) => variant.material)?.material;
  const dimensions = mappedVariants.find((variant) => variant.dimensions)?.dimensions;
  const shippingTier = mappedVariants.find((variant) => variant.shippingTier)?.shippingTier;
  const installation = mappedVariants.some((variant) => variant.installation);

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    thumbnail: product.media?.find((item) => item.type === 'IMAGE')?.url,
    productCode: product.productCode,
    description: (product.description || product.shortDescription || '').slice(0, 400) || undefined,
    category: categories
      .filter((category) => category.type === 'PRODUCT_CATEGORY')
      .map((c) => c.name),
    room: categories.filter((category) => category.type === 'ROOM').map((c) => c.name),
    priceFrom: prices.length > 0 ? Math.min(...prices) : undefined,
    priceTo: prices.length > 0 ? Math.max(...prices) : undefined,
    colors: colors.length > 0 ? colors : undefined,
    material,
    dimensions,
    warrantyMonths: product.warrantyMonths,
    stockStatus: stockStatusOf(mappedVariants),
    shippingTier,
    variants: mappedVariants.length > 0 ? mappedVariants : undefined,
  };
}

function toCollection(
  collection: CollectionDoc,
  availableProductIds: Set<string>,
  productNames: Map<string, string>,
): GeminiChatCollection {
  const names = collection.products
    .map((item) => String(item.productId))
    .filter((id) => availableProductIds.has(id))
    .map((id) => productNames.get(id))
    .filter((name): name is string => Boolean(name));

  return {
    name: collection.name,
    slogan: collection.slogan || undefined,
    description:
      (collection.shortDescription || collection.description || '').slice(0, 300) || undefined,
    productNames: names.slice(0, 10),
  };
}

function toShowroom(showroom: ShowroomDoc): GeminiChatShowroom {
  return {
    name: showroom.name,
    city: showroom.city,
    address: showroom.address,
    phone: showroom.phone,
    openTime: showroom.openTime,
    closeTime: showroom.closeTime,
  };
}

async function loadCatalog(): Promise<ChatCatalog> {
  const [products, categories, collections, showrooms] = await Promise.all([
    ProductModel.find({ status: 'ACTIVE' })
      .sort({ listedAt: -1, createdAt: -1 })
      .limit(MAX_PRODUCTS)
      .lean(),
    CategoryModel.find({ status: 'VISIBLE' }, { name: 1, type: 1 }).lean(),
    CollectionModel.find({ status: 'VISIBLE' }).sort({ displayOrder: 1 }).lean(),
    ShowroomModel.find({ status: 'VISIBLE' }).sort({ displayOrder: 1 }).lean(),
  ]);

  const variants =
    products.length > 0
      ? await VariantModel.find({
          productId: { $in: products.map((product) => product._id) },
          status: 'ACTIVE',
        }).lean()
      : [];

  const variantsByProduct = new Map<string, VariantDoc[]>();
  for (const variant of variants) {
    const key = String(variant.productId);
    const list = variantsByProduct.get(key);
    if (list) {
      list.push(variant);
    } else {
      variantsByProduct.set(key, [variant]);
    }
  }

  const categoryById = new Map<string, CategoryLookup>(
    categories.map((category) => [String(category._id), category]),
  );
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const availableProductIds = new Set(productById.keys());
  const productNames = new Map(products.map((product) => [String(product._id), product.name]));

  const mapped = products
    .map((product) =>
      toProduct(product, variantsByProduct.get(String(product._id)) ?? [], categoryById),
    )
    .filter((product) => Boolean(product.name));

  return {
    products: mapped,
    showrooms: showrooms.map(toShowroom),
    collections: collections
      .map((collection) => toCollection(collection, availableProductIds, productNames))
      .filter((collection) => collection.productNames.length > 0),
  };
}

/**
 * Catalog rút gọn lấy trực tiếp từ MongoDB. Cache 5 phút để không query mỗi tin nhắn.
 */
export async function getChatCatalog(): Promise<ChatCatalog> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  if (inflight) {
    return inflight;
  }

  inflight = loadCatalog()
    .then((value) => {
      cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Catalog lỗi không được làm chết chat: trả rỗng và để AI trả lời theo chính sách. */
export async function getChatCatalogSafe(): Promise<ChatCatalog> {
  try {
    return await getChatCatalog();
  } catch (error) {
    logger.error({ err: error }, 'Không tải được catalog chat từ MongoDB');
    return EMPTY_CATALOG;
  }
}

export async function getPublicChatCatalog(): Promise<ChatCatalog> {
  return getChatCatalogSafe();
}
