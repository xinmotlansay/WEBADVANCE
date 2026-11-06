import { Schema, model, type Types } from 'mongoose';

export interface InspirationDoc {
  _id: Types.ObjectId;
  imageUrl: string;
  status: 'VISIBLE' | 'HIDDEN';
  products: { productId: Types.ObjectId; displayOrder: number }[];
  /** Thứ tự trong lưới khách (tăng dần). */
  displayOrder: number;
  /** Khóa lạc quan khi admin sửa. */
  version: number;
}

const inspirationSchema = new Schema<InspirationDoc>(
  {
    imageUrl: { type: String, required: true },
    status: { type: String, required: true, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
    products: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'products', required: true },
        displayOrder: { type: Number, required: true },
      },
    ],
    displayOrder: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const InspirationModel = model<InspirationDoc>('inspirations', inspirationSchema);
