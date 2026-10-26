import { Schema, model, type Types } from 'mongoose';

export interface CollectionHotspot {
  productId: Types.ObjectId;
  x: number;
  y: number;
  displayOrder?: number;
}

export interface CollectionImage {
  _id: Types.ObjectId;
  url: string;
  title?: string;
  description?: string;
  isThumbnail: boolean;
  displayOrder: number;
  hotspots: CollectionHotspot[];
}

export interface CollectionDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  slogan: string;
  shortDescription?: string;
  description?: string;
  displayOrder: number;
  status: 'VISIBLE' | 'HIDDEN';
  products: { productId: Types.ObjectId; displayOrder?: number }[];
  images: CollectionImage[];
}

const hotspotSchema = new Schema<CollectionHotspot>({
  productId: { type: Schema.Types.ObjectId, ref: 'products', required: true },
  x: { type: Number, required: true, min: 0, max: 1 },
  y: { type: Number, required: true, min: 0, max: 1 },
  displayOrder: Number,
});

const imageSchema = new Schema<CollectionImage>({
  url: { type: String, required: true },
  title: String,
  description: String,
  isThumbnail: { type: Boolean, required: true, default: false },
  displayOrder: { type: Number, required: true },
  hotspots: [hotspotSchema],
});

const collectionSchema = new Schema<CollectionDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    slogan: { type: String, default: '' },
    shortDescription: { type: String, maxlength: 255 },
    description: String,
    displayOrder: { type: Number, default: 0 },
    status: { type: String, required: true, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
    products: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'products', required: true },
        displayOrder: Number,
      },
    ],
    images: [imageSchema],
  },
  { timestamps: true },
);

export const CollectionModel = model<CollectionDoc>('product_collections', collectionSchema);
