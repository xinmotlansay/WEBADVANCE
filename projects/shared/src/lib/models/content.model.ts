/** Nội dung marketing phía khách (`/content/*`), khớp `resolveBlocks()` của server. */

export interface AnnouncementBar {
  id: string;
  text: string;
  linkUrl: string | null;
}

export type ContentBlockType = 'COLLECTIONS' | 'PROMOTION';

export interface ContentBlockItem {
  id?: string;
  name?: string;
  slug?: string;
  imageUrl?: string;
  /** Khối Collection chọn theo collection: `/collections/<slug>`. */
  link?: string;
  /** Khối khuyến mãi. */
  endDate?: string;
  /** Khối bài viết mới. */
  title?: string;
  coverUrl?: string;
  summary?: string;
}

export interface ContentBlock {
  type: ContentBlockType;
  /** Các trường chữ luôn có, trống là chuỗi rỗng. */
  title: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  ctaUrl: string;
  items: ContentBlockItem[];
}

