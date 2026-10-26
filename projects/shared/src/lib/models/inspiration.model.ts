import type { ProductListItem } from './product.model';

export interface InspirationSummary {
  id: string;
  imageUrl: string;
}

export interface InspirationDetail extends InspirationSummary {
  products: ProductListItem[];
}
