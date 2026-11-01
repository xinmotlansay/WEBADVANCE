import { Schema, model, type Types } from 'mongoose';
import { FLOOR_TYPES, isWallColor, type FloorType } from './view-room.constants.js';

export interface LayoutItem {
  productId: Types.ObjectId;
  x: number;
  z: number;
  rotationY: number;
}

export interface ViewRoomLayoutDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  roomCategoryId?: Types.ObjectId;
  room: {
    length: number;
    width: number;
    height: number;
    wallColor: string;
    floorType: FloorType;
  };
  items: LayoutItem[];
  createdAt: Date;
  updatedAt: Date;
}

const layoutSchema = new Schema<ViewRoomLayoutDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    roomCategoryId: { type: Schema.Types.ObjectId, ref: 'categories' },
    room: {
      length: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
      wallColor: { type: String, required: true, validate: isWallColor },
      floorType: { type: String, required: true, enum: FLOOR_TYPES },
    },
    items: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'products', required: true },
        x: { type: Number, required: true },
        z: { type: Number, required: true },
        rotationY: { type: Number, required: true, default: 0 },
      },
    ],
  },
  { timestamps: true },
);

export const ViewRoomLayoutModel = model<ViewRoomLayoutDoc>('view_room_layouts', layoutSchema);
