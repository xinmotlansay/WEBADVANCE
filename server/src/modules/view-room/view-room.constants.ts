/** Giới hạn kích thước phòng (cm). Đặt tạm theo đề xuất, chỉnh tại đây khi có quyết định khác. */
export const ROOM_LIMITS = {
  length: { min: 300, max: 800 },
  width: { min: 300, max: 800 },
  height: { min: 250, max: 350 },
} as const;

/** Bảng màu tường có sẵn. Ngoài ra người dùng có thể chọn màu tự do dưới dạng mã hex. */
export const WALL_COLORS = ['SKY', 'WHITE', 'BLUSH', 'PINK'] as const;
export const WALL_HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const FLOOR_TYPES = ['WOOD', 'TILE'] as const;

export type FloorType = (typeof FLOOR_TYPES)[number];

export function isWallColor(value: string): boolean {
  return (WALL_COLORS as readonly string[]).includes(value) || WALL_HEX_COLOR.test(value);
}

export const MAX_LAYOUT_ITEMS = 30;
