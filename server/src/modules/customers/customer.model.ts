import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface CustomerAddressDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward: string;
  district: string;
  province: string;
  isDefault: boolean;
}

const customerAddressSchema = new Schema<CustomerAddressDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'addresses' },
);
customerAddressSchema.index({ userId: 1, isDefault: -1 });

export type CustomerAddressDocument = HydratedDocument<CustomerAddressDoc>;
export const CustomerAddressModel = model<CustomerAddressDoc>('Address', customerAddressSchema);
