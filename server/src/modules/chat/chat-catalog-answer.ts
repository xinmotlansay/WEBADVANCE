import type { GeminiChatProduct } from '../../integrations/gemini.js';
import type { ChatAiProductSuggestion } from '../../lib/shared-api.js';

type Catalog = { products: GeminiChatProduct[] };
type PriceQuery = { comparison: 'above' | 'below' | 'around'; amount: number };

function parsePriceQuery(message: string): PriceQuery | null {
  const amountMatch =
    message.match(/(\d+(?:[.,]\d+)?)\s*(triệu|triệu đồng|tr\b|m(?:\s|$|đ|đồng|vnd))/i) ??
    message.match(/(\d{1,3}(?:[.,]\d{3})+|\d{7,})\s*(?:đ|đồng|vnd)?/i);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1];
  const unit = amountMatch[2]?.toLowerCase();
  const amount =
    unit && /^(triệu|triệu đồng|tr\b|m)/i.test(unit)
      ? Number(rawAmount.replace(',', '.')) * 1_000_000
      : Number(rawAmount.replace(/[.,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const normalized = message.toLowerCase();
  const comparison: PriceQuery['comparison'] | null = /\b(trên|hơn|từ|>=|ít nhất)\b/.test(
    normalized,
  )
    ? 'above'
    : /\b(dưới|thấp hơn|ít hơn|<=|tối đa)\b/.test(normalized)
      ? 'below'
      : /\b(tầm|khoảng|quanh|gần)\b/.test(normalized)
        ? 'around'
        : null;
  return comparison ? { comparison, amount } : null;
}

function productPrice(product: GeminiChatProduct): number[] {
  const variantPrices = product.variants?.map((variant) => variant.price) ?? [];
  return variantPrices.length > 0
    ? variantPrices
    : [product.priceFrom, product.priceTo].filter((price): price is number => price !== undefined);
}

function matchesProductType(message: string, product: GeminiChatProduct): boolean {
  const types = ['sofa', 'bàn', 'ghế', 'giường', 'tủ', 'đèn', 'nệm', 'gương'];
  const requestedType = types.find((type) => message.includes(type));
  if (!requestedType) return true;

  const productDescription = [product.name, ...(product.category ?? [])].join(' ').toLowerCase();
  return productDescription.includes(requestedType);
}

export function findCatalogPriceProducts(
  message: string,
  catalog: Catalog,
): GeminiChatProduct[] | null {
  const query = parsePriceQuery(message.toLowerCase());
  if (!query) return null;

  return catalog.products
    .filter((product) => matchesProductType(message.toLowerCase(), product))
    .map((product) => ({
      product,
      prices: productPrice(product),
    }))
    .filter(({ prices }) => prices.length > 0)
    .map(({ product, prices }) => ({
      product,
      prices,
      distance: Math.min(...prices.map((price) => Math.abs(price - query.amount))),
    }))
    .filter(({ prices, distance }) => {
      if (query.comparison === 'above') return Math.max(...prices) > query.amount;
      if (query.comparison === 'below') return Math.min(...prices) < query.amount;
      return distance <= query.amount * 0.35;
    })
    .sort((a, b) => {
      if (query.comparison === 'above') {
        return Math.min(...a.prices) - Math.min(...b.prices);
      }
      if (query.comparison === 'below') {
        return Math.max(...b.prices) - Math.max(...a.prices);
      }
      return a.distance - b.distance;
    })
    .slice(0, 5)
    .map(({ product }) => product);
}

/** Biến slug do model chọn thành thẻ sản phẩm đầy đủ thuộc tính để frontend render. */
export function selectCatalogSuggestionProducts(
  catalog: Catalog,
  slugs: string[],
): ChatAiProductSuggestion[] {
  const bySlug = new Map(
    catalog.products
      .filter((product): product is GeminiChatProduct & { slug: string } => Boolean(product.slug))
      .map((product) => [product.slug, product]),
  );

  const picked: GeminiChatProduct[] = [];
  const seen = new Set<string>();

  for (const slug of slugs) {
    if (picked.length >= 4) break;
    if (seen.has(slug)) continue;

    const product = bySlug.get(slug);
    if (!product) continue;

    seen.add(slug);
    picked.push(product);
  }

  return picked.map(toSuggestion);
}

function toSuggestion(product: GeminiChatProduct): ChatAiProductSuggestion {
  const variantPrices =
    product.variants?.map((variant) => variant.price).filter((price) => price > 0) ?? [];
  const price = product.priceFrom ?? (variantPrices.length ? Math.min(...variantPrices) : 0);
  const originalPrices =
    product.variants
      ?.map((variant) => variant.originalPrice)
      .filter((value): value is number => typeof value === 'number' && value > price) ?? [];
  const originalPrice = originalPrices.length ? Math.min(...originalPrices) : undefined;

  const attributes = [
    product.material ? `Chất liệu: ${product.material}` : '',
    product.colors?.length ? `Màu: ${product.colors.join(', ')}` : '',
    product.dimensions ? `Kích thước: ${product.dimensions}` : '',
    product.category?.length ? `Danh mục: ${product.category.join(', ')}` : '',
    product.room?.length ? `Phòng: ${product.room.join(', ')}` : '',
    product.warrantyMonths ? `Bảo hành ${product.warrantyMonths} tháng` : '',
  ].filter(Boolean);

  return {
    id: product.id ?? product.slug ?? product.name,
    name: product.name,
    slug: product.slug ?? '',
    thumbnail: product.thumbnail ?? '',
    price,
    originalPrice,
    attributes,
    colors: product.colors ?? [],
    category: product.category ?? [],
    room: product.room ?? [],
    material: product.material,
    dimensions: product.dimensions,
    stockStatus: product.stockStatus,
    warrantyMonths: product.warrantyMonths,
    hasPromotion: originalPrice !== undefined,
  };
}
