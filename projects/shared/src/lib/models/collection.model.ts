import { ProductListItem } from './product.model';
export interface CollectionHotspot {
  x: number;
  y: number;
  product: ProductListItem;
}
export interface CollectionImage {
  id: string;
  url: string;
  title: string;
  isThumbnail: boolean;
  displayOrder: number;
  hotspots: CollectionHotspot[];
}
export interface CollectionDetail {
  id: string;
  name: string;
  slogan: string;
  description: string;
  images: CollectionImage[];
  products: ProductListItem[];
}
export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
  slogan: string;
  shortDescription: string;
  thumbnail: string;
}
