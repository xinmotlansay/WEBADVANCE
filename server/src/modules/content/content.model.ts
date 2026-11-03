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
  categoryIds: string[];
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

export interface ContentAreaDoc {
  _id: Types.ObjectId;
  key: ContentKey;
  /** Bản nháp đang soạn. */
  draft?: ContentData | null;
  /** Bản đã đăng, tách riêng khỏi bản nháp. */
  published?: ContentData | null;
  /** Bản hẹn giờ: có hiệu lực khi `publishAt` đến (tính lúc đọc, không cần job). */
  scheduled?: { data: ContentData; publishAt: Date } | null;
  version: number;
  updatedBy?: Types.ObjectId;
  updatedAt?: Date;
}

const schema = new Schema<ContentAreaDoc>(
  {
    key: { type: String, enum: ['HOME', 'ANNOUNCEMENT_BAR'], required: true, unique: true },
    draft: { type: Schema.Types.Mixed, default: null },
    published: { type: Schema.Types.Mixed, default: null },
    scheduled: { type: Schema.Types.Mixed, default: null },
    version: { type: Number, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'users' },
  },
  { timestamps: true, collection: 'content_areas', minimize: false },
);

export const ContentAreaModel = model<ContentAreaDoc>('content_areas', schema);
