export type ProductBadge = 'NEW' | 'BEST_SELLER';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  thumbnail: string;
  priceFrom: number;
  originalPriceFrom: number;
  hasPromotion: boolean;
  badges: ProductBadge[];
  stockStatus: StockStatus;
  colors: string[];
  ratingAverage: number;
  ratingCount: number;
  isWishlisted?: boolean;
}

export type ProductSort = 'price_asc' | 'price_desc' | 'newest' | 'name_asc' | 'name_desc';

export interface ProductListQuery {
  q?: string;
  categoryIds?: string[];
  badge?: ProductBadge;
  hasPromotion?: boolean;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

export interface VariantPrice {
  original: number;
  sale: number;
  final: number;
  promotionId: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  material: string;
  dimensions: { length?: number; width?: number; height?: number; unit: string } | null;
  price: VariantPrice;
  stockStatus: StockStatus;
  shippingTier: number | null;
  installation: { service: 'NONE' | 'OPTIONAL' | 'REQUIRED'; fee: number };
}

/** `GET /products/:slug` (API Design 5.2). */
export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  productCode: string;
  shortDescription: string;
  description: string;
  thumbnail: string;
  badges: ProductBadge[];
  tags: string[];
  categories: { id: string; name: string; slug: string; type: string }[];
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
  variants: ProductVariant[];
}
