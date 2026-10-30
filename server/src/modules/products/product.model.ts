import { Schema, model, type Types } from 'mongoose';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'DISCONTINUED';
export type ManualBadge = 'ON' | 'OFF' | null;

export type MediaPurpose = 'MAIN' | 'VARIANT' | 'LIFESTYLE' | 'DIMENSION' | 'PART' | 'MODEL';

export interface ProductMedia {
  variantId?: Types.ObjectId | null;
  type: 'IMAGE' | 'VIDEO_360' | 'MODEL_3D';
  url: string;
  format?: string;
  displayOrder: number;
  purpose?: MediaPurpose;
}

export interface ProductPart {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  quantity: number;
  image?: string;
  displayOrder?: number;
  isDetachable: boolean;
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
  seo?: { title?: string; description?: string };
  categoryIds: Types.ObjectId[];
  manualBadges: { isNew: ManualBadge; isBestSeller: ManualBadge };
  isAutoBestSeller: boolean;
  listedAt?: Date;
  warrantyMonths: number;
  warrantyTerms?: string;
  status: ProductStatus;
  media: ProductMedia[];
  parts: ProductPart[];
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
    seo: { title: String, description: String },
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
        purpose: {
          type: String,
          enum: ['MAIN', 'VARIANT', 'LIFESTYLE', 'DIMENSION', 'PART', 'MODEL'],
        },
      },
    ],
    parts: [
      {
        name: { type: String, required: true },
        description: String,
        quantity: { type: Number, required: true, min: 1 },
        image: String,
        displayOrder: Number,
        isDetachable: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

productSchema.index({ status: 1, listedAt: -1 });
productSchema.index({ categoryIds: 1 });

export const ProductModel = model<ProductDoc>('products', productSchema);
