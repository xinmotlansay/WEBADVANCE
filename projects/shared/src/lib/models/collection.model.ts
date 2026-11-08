import type { ProductListItem } from './product.model';

export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
  slogan: string;
  shortDescription: string;
  thumbnail: string;
  /** Ảnh đại diện kèm hotspot; có thể thiếu khi bộ sưu tập chưa có ảnh. */
  thumbnailImage?: CollectionImage;
}

export interface CollectionHotspot {
  /** Slug sản phẩm để liên kết tới trang chi tiết. */
  slug: string;
  /** Thông tin sản phẩm để hiện thẻ xem nhanh. */
  product: ProductListItem;
  /** Vị trí tương đối trên ảnh, từ 0 đến 1. */
  x: number;
  y: number;
}

export interface CollectionImage {
  id: string;
  url: string;
  title: string;
  description: string;
  hotspots: CollectionHotspot[];
}

export interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  slogan: string;
  shortDescription: string;
  description: string;
  images: CollectionImage[];
  products: ProductListItem[];
}
