import { z } from 'zod';
import {
  FLOOR_TYPES,
  MAX_LAYOUT_ITEMS,
  ROOM_LIMITS,
  WALL_HEX_COLOR,
  WALL_COLORS,
} from './view-room.constants.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Mã không hợp lệ');

const roomSizeSchema = z.object({
  length: z.number().int().min(ROOM_LIMITS.length.min).max(ROOM_LIMITS.length.max),
  width: z.number().int().min(ROOM_LIMITS.width.min).max(ROOM_LIMITS.width.max),
  height: z.number().int().min(ROOM_LIMITS.height.min).max(ROOM_LIMITS.height.max),
});

export const suggestionSchema = z.object({
  roomCategoryId: objectId,
  placedProductIds: z.array(objectId).max(MAX_LAYOUT_ITEMS).default([]),
  roomSize: roomSizeSchema.optional(),
});

export const layoutSchema = z.object({
  roomCategoryId: objectId.optional(),
  name: z.string().trim().min(1).max(100),
  room: roomSizeSchema.extend({
    wallColor: z.union([z.enum(WALL_COLORS), z.string().regex(WALL_HEX_COLOR)]),
    floorType: z.enum(FLOOR_TYPES),
  }),
  items: z
    .array(
      z.object({
        productId: objectId,
        x: z.number().finite(),
        z: z.number().finite(),
        rotationY: z.number().finite().min(0).max(360),
      }),
    )
    .max(MAX_LAYOUT_ITEMS),
});

export type SuggestionInput = z.infer<typeof suggestionSchema>;
export type LayoutInput = z.infer<typeof layoutSchema>;
