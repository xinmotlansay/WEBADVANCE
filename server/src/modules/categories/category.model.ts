import { Schema, model, type Types } from 'mongoose';

export type CategoryType = 'PRODUCT_CATEGORY' | 'ROOM' | 'STYLE';

export interface CategoryDoc {
  _id: Types.ObjectId;
  parentId: Types.ObjectId | null;
  name: string;
  slug: string;
  type: CategoryType;
  description: string;
  image: string;
  status: 'VISIBLE' | 'HIDDEN';
  typicalCategoryIds: Types.ObjectId[];
}

const categorySchema = new Schema<CategoryDoc>(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'categories', default: null },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['PRODUCT_CATEGORY', 'ROOM', 'STYLE'] },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    status: { type: String, required: true, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
    typicalCategoryIds: [{ type: Schema.Types.ObjectId, ref: 'categories' }],
  },
  { timestamps: true },
);

export const CategoryModel = model<CategoryDoc>('categories', categorySchema);
