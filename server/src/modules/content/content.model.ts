import { Schema, model, type Types } from 'mongoose';

export type ContentKey = 'HOME' | 'ANNOUNCEMENT_BAR';
export type HomeBlockType = 'BRAND_INTRO' | 'FEATURED_PRODUCTS' | 'COLLECTIONS' | 'PROMOTION' | 'LATEST_ARTICLES';

export interface HomeBlock {
  type: HomeBlockType;
  enabled: boolean;
  title: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  ctaUrl: string;
  productIds: string[];
  /** Dữ liệu cũ của khối Bộ sưu tập (trước khi chọn theo collection); vẫn hiển thị nếu chưa có `collectionIds`. */
  categoryIds: string[];
  /** Khối Bộ sưu tập: collection theo thứ tự đã chọn. Bản ghi cũ có thể thiếu. */
  collectionIds: string[];
  promotionIds: string[];
}
export interface HomeData {
  blocks: HomeBlock[];
}
export interface BarData {
  enabled: boolean;
  text: string;
  linkUrl: string;
  /** ISO; trống = không giới hạn. */
  startAt: string;
  endAt: string;
}
export type ContentData = HomeData | BarData;

/** Khóa khu vực nội dung: HOME, ANNOUNCEMENT_BAR hoặc `LP:<slug>` cho landing page. */
export type AreaKey = ContentKey | `LP:${string}`;

/** Một phiên bản đã đăng / hẹn đăng. `id` = `version` của khu vực lúc lưu, nên không trùng. */
export interface ContentVersion {
  id: number;
  data: ContentData;
  savedAt: Date;
  by?: string;
  action: 'PUBLISH' | 'SCHEDULE';
}

export interface ContentAreaDoc {
  _id: Types.ObjectId;
  key: AreaKey;
  /** Bản nháp đang soạn. */
  draft?: ContentData | null;
  /** Bản đã đăng, tách riêng khỏi bản nháp. */
  published?: ContentData | null;
  /** Bản hẹn giờ: có hiệu lực khi `publishAt` đến (tính lúc đọc, không cần job). */
  scheduled?: { data: ContentData; publishAt: Date } | null;
  /** 10 phiên bản gần nhất, cũ → mới. */
  versions?: ContentVersion[];
  /** Chỉ landing page. */
  name?: string;
  seoTitle?: string;
  metaDescription?: string;
  /** Landing page không xóa, chỉ ẩn. */
  hidden?: boolean;
  version: number;
  updatedBy?: Types.ObjectId;
  updatedAt?: Date;
}

const schema = new Schema<ContentAreaDoc>(
  {
    key: { type: String, required: true, unique: true },
    draft: { type: Schema.Types.Mixed, default: null },
    published: { type: Schema.Types.Mixed, default: null },
    scheduled: { type: Schema.Types.Mixed, default: null },
    versions: { type: Schema.Types.Mixed, default: [] },
    name: String,
    seoTitle: String,
    metaDescription: String,
    hidden: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'users' },
  },
  { timestamps: true, collection: 'content_areas', minimize: false },
);

export const ContentAreaModel = model<ContentAreaDoc>('content_areas', schema);
