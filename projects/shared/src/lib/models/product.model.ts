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
export interface ProductDetail extends ProductListItem {
  productCode: string;
  description: string;
  warranty: { months: number; terms: string };
  media: { type: 'IMAGE' | 'VIDEO_360' | 'MODEL_3D'; url: string; displayOrder: number }[];
  variants: {
    id: string;
    sku: string;
    color: string;
    material: string;
    dimensions?: { length?: number; width?: number; height?: number; unit: string };
    stockStatus: StockStatus;
    price: { original: number; sale: number; final: number };
  }[];
}

export interface ProductListQuery {
  q?: string;
  color?: string[];
  material?: string[];
  minLength?: number;
  maxLength?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
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
