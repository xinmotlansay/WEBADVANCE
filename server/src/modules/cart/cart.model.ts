import { Schema, model, type Types } from 'mongoose';

export interface CartItem {
  _id: Types.ObjectId;
  variantId: Types.ObjectId;
  quantity: number;
  isSelected: boolean;
  /** Giá một sản phẩm sau khuyến mãi lúc thêm, so với giá hiện tại để báo `PRICE_CHANGED`. */
  priceAtAdd: number;
  hasInstallation: boolean;
  note?: string;
}

export interface CartDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  appliedVoucherId: Types.ObjectId | null;
  items: Types.DocumentArray<CartItem>;
}

const cartSchema = new Schema<CartDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
    appliedVoucherId: { type: Schema.Types.ObjectId, ref: 'vouchers', default: null },
    items: [
      {
        variantId: { type: Schema.Types.ObjectId, ref: 'product_variants', required: true },
        quantity: { type: Number, required: true, min: 1 },
        isSelected: { type: Boolean, required: true, default: true },
        priceAtAdd: { type: Number, required: true },
        hasInstallation: { type: Boolean, default: false },
        note: { type: String, maxlength: 500 },
      },
    ],
  },
  { timestamps: true },
);

export const CartModel = model<CartDoc>('carts', cartSchema);
