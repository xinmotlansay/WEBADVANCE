import { Schema, model, type Types } from 'mongoose';

export type ShowroomRegion = 'NORTH' | 'CENTRAL' | 'SOUTH';

export interface ShowroomDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  city: string;
  region: ShowroomRegion;
  address: string;
  phone?: string;
  openTime: string;
  closeTime: string;
  latitude: number;
  longitude: number;
  image: string;
  isFlagship: boolean;
  displayOrder: number;
  status: 'VISIBLE' | 'HIDDEN';
}

const showroomSchema = new Schema<ShowroomDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    city: { type: String, required: true },
    region: { type: String, required: true, enum: ['NORTH', 'CENTRAL', 'SOUTH'] },
    address: { type: String, required: true },
    phone: String,
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    image: { type: String, default: '' },
    isFlagship: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    status: { type: String, required: true, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
  },
  { timestamps: true },
);

export const ShowroomModel = model<ShowroomDoc>('showrooms', showroomSchema);
