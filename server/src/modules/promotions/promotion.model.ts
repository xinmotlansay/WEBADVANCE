import { Schema, model, type Types } from 'mongoose';

export interface PromotionTarget {
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  specificDiscountValue?: number;
  quantityLimit?: number;
}

export interface PromotionDoc {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue?: number;
  minOrderValue?: number;
  startDate: Date;
  endDate: Date;
  status: 'UPCOMING' | 'RUNNING' | 'ENDED' | 'PAUSED';
  targets: PromotionTarget[];
}

const promotionSchema = new Schema<PromotionDoc>(
  {
    name: { type: String, required: true },
    description: String,
    discountType: { type: String, required: true, enum: ['PERCENT', 'FIXED_AMOUNT'] },
    discountValue: { type: Number, required: true },
    maxDiscountValue: Number,
    minOrderValue: Number,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['UPCOMING', 'RUNNING', 'ENDED', 'PAUSED'],
    },
    targets: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'products' },
        categoryId: { type: Schema.Types.ObjectId, ref: 'categories' },
        specificDiscountValue: Number,
        quantityLimit: Number,
      },
    ],
  },
  { timestamps: true },
);

export const PromotionModel = model<PromotionDoc>('promotions', promotionSchema);
