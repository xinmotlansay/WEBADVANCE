import { Schema, model, type Types } from 'mongoose';

export interface BannerDoc {
  _id: Types.ObjectId;
  title?: string;
  content?: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder: number;
  startDate: Date;
  endDate: Date;
  status: 'VISIBLE' | 'HIDDEN';
  impressionCount: number;
  clickCount: number;
}

const bannerSchema = new Schema<BannerDoc>(
  {
    title: String,
    content: String,
    imageUrl: { type: String, required: true },
    linkUrl: String,
    displayOrder: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, required: true, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
    impressionCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const BannerModel = model<BannerDoc>('banners', bannerSchema);
