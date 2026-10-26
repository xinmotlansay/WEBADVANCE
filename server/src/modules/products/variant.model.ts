import { Schema, model, type Types } from 'mongoose';

export interface VariantDoc {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  sku: string;
  color?: string;
  material?: string;
  dimensions?: { length?: number; width?: number; height?: number; unit: string };
  weight?: number;
  shippingTier?: number;
  originalPrice: number;
  salePrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  installationService: 'NONE' | 'OPTIONAL' | 'REQUIRED';
  installationFee?: number;
  status: 'ACTIVE' | 'DISCONTINUED';
}

const variantSchema = new Schema<VariantDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'products', required: true, index: true },
    sku: { type: String, required: true, unique: true },
    color: String,
    material: String,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, default: 'cm' },
    },
    weight: Number,
    shippingTier: { type: Number, min: 1, max: 4 },
    originalPrice: { type: Number, required: true },
    salePrice: { type: Number, required: true },
    stockQuantity: { type: Number, required: true, min: 0 },
    lowStockThreshold: { type: Number, required: true },
    installationService: { type: String, enum: ['NONE', 'OPTIONAL', 'REQUIRED'], default: 'NONE' },
    installationFee: Number,
    status: { type: String, required: true, enum: ['ACTIVE', 'DISCONTINUED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

export const VariantModel = model<VariantDoc>('product_variants', variantSchema);
