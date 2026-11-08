import { Schema, model, type Types } from 'mongoose';

export interface WalkwayPassage {
  type: 'DOOR' | 'ELEVATOR' | 'STAIRS' | 'HALLWAY';
  label?: string;
  width?: number;
  height?: number;
  length?: number;
  cabinLength?: number;
  cabinWidth?: number;
  cabinHeight?: number;
  loadCapacityKg?: number;
}

export interface WalkwayProfileDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  address?: string;
  isDefault: boolean;
  passages: WalkwayPassage[];
}

const walkwayProfileSchema = new Schema<WalkwayProfileDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    passages: [
      {
        _id: false,
        type: { type: String, required: true, enum: ['DOOR', 'ELEVATOR', 'STAIRS', 'HALLWAY'] },
        label: String,
        width: Number,
        height: Number,
        length: Number,
        cabinLength: Number,
        cabinWidth: Number,
        cabinHeight: Number,
        loadCapacityKg: Number,
      },
    ],
  },
  { timestamps: true },
);

export const WalkwayProfileModel = model<WalkwayProfileDoc>(
  'walkway_profiles',
  walkwayProfileSchema,
);
