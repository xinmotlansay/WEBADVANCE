import { Schema, model, type Types } from 'mongoose';

export interface ReviewDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  rating: number;
  comment?: string;
  images: string[];
  status: 'VISIBLE' | 'PENDING_REVIEW' | 'HIDDEN' | 'REJECTED' | 'DELETED';
  rejectReason?: string;
  isEdited: boolean;
  editedAt?: Date;
  reports: { userId: Types.ObjectId; reason: string; reportedAt: Date }[];
  reportsReviewedAt?: Date;
  createdAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'orders', required: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true, unique: true },
    productId: { type: Schema.Types.ObjectId, ref: 'products', required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'product_variants' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,
    images: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['VISIBLE', 'PENDING_REVIEW', 'HIDDEN', 'REJECTED', 'DELETED'],
      default: 'VISIBLE',
    },
    rejectReason: String,
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    reports: {
      type: [
        {
          _id: false,
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          reason: { type: String, required: true },
          reportedAt: { type: Date, required: true, default: Date.now },
        },
      ],
      default: [],
    },
    reportsReviewedAt: Date,
  },
  { timestamps: true },
);

export const ReviewModel = model<ReviewDoc>('reviews', reviewSchema);
