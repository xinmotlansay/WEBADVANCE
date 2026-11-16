import type { ImageFocus } from './image-focus';
import type { ProductListItem } from './product.model';

export interface InspirationSummary {
  id: string;
  imageUrl: string;
  /** Vùng hiển thị khung 2:3; null = căn giữa. */
  focus?: ImageFocus | null;
}

export interface InspirationDetail extends InspirationSummary {
  products: ProductListItem[];
}
