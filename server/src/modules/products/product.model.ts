import { Schema, model, type Types } from 'mongoose';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'DISCONTINUED';
export type ManualBadge = 'ON' | 'OFF' | null;

export interface ProductMedia {
  variantId?: Types.ObjectId | null;
  type: 'IMAGE' | 'VIDEO_360' | 'MODEL_3D';
  url: string;
  format?: string;
  displayOrder: number;
}

export interface ProductDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  productCode: string;
  shortDescription?: string;
  description?: string;
  searchKeywords?: string;
  tags: string[];
  categoryIds: Types.ObjectId[];
  manualBadges: { isNew: ManualBadge; isBestSeller: ManualBadge };
  isAutoBestSeller: boolean;
  listedAt?: Date;
  warrantyMonths: number;
  warrantyTerms?: string;
  status: ProductStatus;
  media: ProductMedia[];
}

const productSchema = new Schema<ProductDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    productCode: { type: String, required: true, unique: true },
    shortDescription: { type: String, maxlength: 500 },
    description: String,
    searchKeywords: String,
    tags: [String],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'categories' }],
    manualBadges: {
      isNew: { type: String, enum: ['ON', 'OFF', null], default: null },
      isBestSeller: { type: String, enum: ['ON', 'OFF', null], default: null },
    },
    isAutoBestSeller: { type: Boolean, default: false },
    listedAt: Date,
    warrantyMonths: { type: Number, required: true },
    warrantyTerms: String,
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'ACTIVE', 'HIDDEN', 'DISCONTINUED'],
      default: 'DRAFT',
    },
    media: [
      {
        _id: false,
        variantId: { type: Schema.Types.ObjectId, ref: 'product_variants', default: null },
        type: { type: String, required: true, enum: ['IMAGE', 'VIDEO_360', 'MODEL_3D'] },
        url: { type: String, required: true },
        format: String,
        displayOrder: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true },
);

productSchema.index({ status: 1, listedAt: -1 });
productSchema.index({ categoryIds: 1 });

export const ProductModel = model<ProductDoc>('products', productSchema);
