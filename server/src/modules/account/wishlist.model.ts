import { Schema, model, type Types } from 'mongoose';

export interface WishlistDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  addedAt: Date;
}

const wishlistSchema = new Schema<WishlistDoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'products', required: true },
  addedAt: { type: Date, required: true, default: Date.now },
});

wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

export const WishlistModel = model<WishlistDoc>('wishlists', wishlistSchema);
