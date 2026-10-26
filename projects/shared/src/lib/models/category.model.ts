export type CategoryType = 'PRODUCT_CATEGORY' | 'ROOM' | 'STYLE';

export interface Category {
  id: string;
  name: string;
  slug: string;
  type: CategoryType;
  description: string;
  image: string;
  children: Category[];
}
