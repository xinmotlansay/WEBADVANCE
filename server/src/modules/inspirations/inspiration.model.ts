import { Schema, model, type Types } from 'mongoose';

export interface InspirationDoc {
  _id: Types.ObjectId;
  imageUrl: string;
  status: 'VISIBLE' | 'HIDDEN';
  products: { productId: Types.ObjectId; displayOrder: number }[];
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
  },
  { timestamps: true },
);

export const InspirationModel = model<InspirationDoc>('inspirations', inspirationSchema);
