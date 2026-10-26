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
