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
  /** Trạng thái cũ, code phía khách đang đọc. Trạng thái hiển thị dùng `promotionStatus()`. */
  status: 'UPCOMING' | 'RUNNING' | 'ENDED' | 'PAUSED';
  targets: PromotionTarget[];
  /** Mã tự sinh `KM yyMMdd-xxx` (FRD 1.5); dữ liệu cũ chưa có. */
  code?: string;
  scopeType?: 'PRODUCT' | 'CATEGORY';
  excludedProductIds?: Types.ObjectId[];
  /** Trạng thái do người chọn; thiếu thì suy từ `status` cũ. */
  state?: PromotionState;
  /** Đã từng Đang diễn ra: không cho xóa (FR-006). */
  everRan?: boolean;
  endedAt?: Date | null;
  pauseReason?: string | null;
  /** Giá bán các biến thể lúc kích hoạt, để cảnh báo "giá gốc đã đổi" (FR-003 AC3). */
  priceSnapshot?: { variantId: Types.ObjectId; price: number }[];
  /** Khóa lạc quan (E-COM-05). */
  version?: number;
}

export type PromotionState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

const promotionSchema = new Schema<PromotionDoc>(
  {
    name: { type: String, required: true },
    description: String,
    discountType: { type: String, enum: ['PERCENT', 'FIXED_AMOUNT'] },
    discountValue: { type: Number },
    maxDiscountValue: Number,
    minOrderValue: Number,
    startDate: { type: Date },
    endDate: { type: Date },
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
    code: { type: String, unique: true, sparse: true },
    scopeType: { type: String, enum: ['PRODUCT', 'CATEGORY'] },
    excludedProductIds: [{ type: Schema.Types.ObjectId, ref: 'products' }],
    state: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] },
    everRan: { type: Boolean, default: false },
    endedAt: Date,
    pauseReason: String,
    priceSnapshot: [{ _id: false, variantId: Schema.Types.ObjectId, price: Number }],
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PromotionModel = model<PromotionDoc>('promotions', promotionSchema);
