import { Schema, model, type Types } from 'mongoose';

export interface BannerDoc {
  _id: Types.ObjectId;
  title?: string;
  content?: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder: number;
  startDate: Date;
  /** Bỏ trống = không giới hạn (FR-012). */
  endDate?: Date | null;
  status: 'DRAFT' | 'VISIBLE' | 'HIDDEN';
  impressionCount: number;
  clickCount: number;
  /** Mã `BN` + 5 chữ số (FRD 1.5); dữ liệu cũ chưa có. */
  code?: string;
  position: BannerPosition;
  mobileImageUrl?: string;
  ctaLabel?: string;
  openInNewTab?: boolean;
  /** Bắt buộc khi vị trí CATEGORY. */
  categoryIds?: Types.ObjectId[];
  popupFrequency?: 'SESSION' | 'DAILY' | 'ONCE';
  version?: number;
}

export type BannerPosition = 'HOME_SLIDER' | 'HOME_MIDDLE' | 'CATEGORY' | 'POPUP';

const bannerSchema = new Schema<BannerDoc>(
  {
    title: String,
    content: String,
    imageUrl: { type: String, required: true },
    linkUrl: String,
    displayOrder: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: Date,
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'VISIBLE', 'HIDDEN'],
      default: 'VISIBLE',
    },
    impressionCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    code: { type: String, unique: true, sparse: true },
    position: {
      type: String,
      enum: ['HOME_SLIDER', 'HOME_MIDDLE', 'CATEGORY', 'POPUP'],
      default: 'HOME_SLIDER',
    },
    mobileImageUrl: String,
    ctaLabel: String,
    openInNewTab: Boolean,
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'categories' }],
    popupFrequency: { type: String, enum: ['SESSION', 'DAILY', 'ONCE'] },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const BannerModel = model<BannerDoc>('banners', bannerSchema);
