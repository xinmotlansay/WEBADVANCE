import { Schema, model, type Types } from 'mongoose';

export type VoucherType = 'PUBLIC' | 'COLLECTIBLE' | 'ASSIGNED';
/** `ACCOUNT`: mọi khách có tài khoản (FR-008); phía khách coi như `ALL` vì đã bắt buộc đăng nhập. */
export type CustomerGroup = 'ALL' | 'NEW_CUSTOMER' | 'BIRTHDAY_MONTH' | 'ACCOUNT';

export interface VoucherScope {
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
}

export interface VoucherDoc {
  _id: Types.ObjectId;
  promotionId?: Types.ObjectId;
  code: string;
  name?: string;
  type: VoucherType;
  customerGroup: CustomerGroup;
  /** Cho phép cộng với khuyến mãi; `false` thì dòng đang khuyến mãi không được giảm thêm. */
  stackableWithPromotion: boolean;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue?: number | null;
  /** Giá trị đơn tối thiểu, tính sau khuyến mãi. */
  minOrderValue?: number | null;
  /** Rỗng là áp dụng toàn đơn. */
  scope: VoucherScope[];
  totalUsageLimit?: number | null;
  perUserLimit: number;
  usedCount: number;
  startDate: Date;
  endDate: Date;
  /** Vô hiệu hóa (FR-010) đặt `PAUSED` để checkout chặn mã; trạng thái hiển thị dùng `voucherStatus()`. */
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED';
  /** Mô tả hiển thị cho khách (FR-008). */
  description?: string;
  /** PUBLIC hiện ở mục "Ưu đãi"; PRIVATE chỉ ai có mã. */
  visibility?: 'PUBLIC' | 'PRIVATE';
  disabledAt?: Date | null;
  disableReason?: string | null;
  /** Khóa lạc quan (E-COM-05). */
  version?: number;
}

const voucherSchema = new Schema<VoucherDoc>(
  {
    promotionId: { type: Schema.Types.ObjectId, ref: 'promotions' },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: String,
    type: { type: String, required: true, enum: ['PUBLIC', 'COLLECTIBLE', 'ASSIGNED'] },
    customerGroup: {
      type: String,
      enum: ['ALL', 'NEW_CUSTOMER', 'BIRTHDAY_MONTH', 'ACCOUNT'],
      default: 'ALL',
    },
    stackableWithPromotion: { type: Boolean, default: false },
    discountType: { type: String, required: true, enum: ['PERCENT', 'FIXED_AMOUNT'] },
    discountValue: { type: Number, required: true },
    maxDiscountValue: Number,
    minOrderValue: Number,
    scope: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'products' },
        categoryId: { type: Schema.Types.ObjectId, ref: 'categories' },
      },
    ],
    totalUsageLimit: Number,
    perUserLimit: { type: Number, required: true, default: 1 },
    usedCount: { type: Number, required: true, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, required: true, enum: ['ACTIVE', 'PAUSED', 'EXPIRED'] },
    description: String,
    visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' },
    disabledAt: Date,
    disableReason: String,
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const VoucherModel = model<VoucherDoc>('vouchers', voucherSchema);
