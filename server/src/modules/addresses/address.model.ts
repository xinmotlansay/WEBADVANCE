import { Schema, model, type Types } from 'mongoose';

export interface AddressDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district?: string;
  province: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

const addressSchema = new Schema<AddressDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    recipientName: { type: String, required: true, trim: true },
    recipientPhone: { type: String, required: true },
    addressLine: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    province: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, required: true, default: false },
    latitude: { type: Number, min: -90, max: 90, default: null },
    longitude: { type: Number, min: -180, max: 180, default: null },
  },
  { timestamps: true },
);

// Mỗi người tối đa một địa chỉ mặc định.
addressSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'one_default_per_user' },
);

export const AddressModel = model<AddressDoc>('addresses', addressSchema);
