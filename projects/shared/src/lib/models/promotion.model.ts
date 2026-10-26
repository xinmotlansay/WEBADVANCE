import type { ProductListItem } from './product.model';

export interface FlashSale {
  promotion: { id: string; name: string; startDate: string; endDate: string };
  products: ProductListItem[];
}
