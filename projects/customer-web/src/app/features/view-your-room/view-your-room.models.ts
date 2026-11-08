import type { ProductListItem } from 'shared';

export type WallPreset = 'SKY' | 'WHITE' | 'BLUSH' | 'PINK';
/** Màu tường: mã preset trong `WALL_SWATCHES` hoặc mã hex do người dùng tự chọn. */
export type WallColor = WallPreset | `#${string}`;
export type FloorType = 'WOOD' | 'TILE';
export type Placement = 'FLOOR' | 'WALL';

/** Kích thước phòng tính bằng cm, khớp `ROOM_LIMITS` ở server. */
export const ROOM_LIMITS = {
  length: { min: 300, max: 800, step: 10 },
  width: { min: 300, max: 800, step: 10 },
  height: { min: 250, max: 350, step: 10 },
} as const;

export interface RoomConfig {
  length: number;
  width: number;
  height: number;
  wallColor: WallColor;
  floorType: FloorType;
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: string;
}

export interface PlacedItem {
  uid: string;
  productId: string;
  slug: string;
  name: string;
  priceFrom: number;
  model3DUrl: string | null;
  dimensions: Dimensions | null;
  /** `WALL` = treo tường (tranh, đồng hồ...): chỉ dính vào tường và có độ cao `y`. */
  placement?: Placement;
  /** Tâm đáy sản phẩm trên mặt sàn, tính bằng mét, gốc tọa độ ở tâm phòng. */
  x: number;
  z: number;
  /** Đồ treo tường: độ cao mép dưới so với sàn (m). Đồ để sàn bỏ qua. */
  y?: number;
  rotationY: number;
}

export interface LayoutSnapshot {
  room: RoomConfig;
  items: PlacedItem[];
}

export interface ProductDetail extends ProductListItem {
  description: string;
  has3DModel: boolean;
  model3DUrl: string | null;
  dimensions: Dimensions | null;
  placement?: Placement;
}

export interface MissingGroup {
  category: { id: string; name: string };
  products: ProductListItem[];
}

export interface RoomSuggestions {
  similar: ProductListItem[];
  missing: MissingGroup[];
}

export interface SizePreset {
  label: string;
  length: number;
  width: number;
}

/** Bộ kích thước mẫu cho từng loại phòng (slug trong danh mục ROOM). Mục giữa là mặc định. */
const ROOM_SIZE_PRESETS: Record<string, SizePreset[]> = {
  'phong-ngu': [
    { label: 'Nhỏ', length: 300, width: 350 },
    { label: 'Vừa', length: 350, width: 400 },
    { label: 'Lớn', length: 400, width: 500 },
  ],
  'phong-khach': [
    { label: 'Nhỏ', length: 400, width: 500 },
    { label: 'Vừa', length: 500, width: 600 },
    { label: 'Lớn', length: 600, width: 700 },
  ],
  'phong-bep': [
    { label: 'Nhỏ', length: 300, width: 300 },
    { label: 'Vừa', length: 300, width: 400 },
    { label: 'Lớn', length: 350, width: 450 },
  ],
  'phong-tam': [
    { label: 'Nhỏ', length: 300, width: 300 },
    { label: 'Vừa', length: 300, width: 400 },
    { label: 'Lớn', length: 400, width: 400 },
  ],
};

const FALLBACK_ROOM_SLUG = 'phong-ngu';

export function roomSizePresets(roomSlug: string | null): SizePreset[] {
  return ROOM_SIZE_PRESETS[roomSlug ?? ''] ?? ROOM_SIZE_PRESETS[FALLBACK_ROOM_SLUG];
}

/** Kích thước mặc định khi chọn loại phòng: mức "Vừa" trong bộ mẫu của loại phòng đó. */
export function defaultRoomSize(roomSlug: string | null): SizePreset {
  const presets = roomSizePresets(roomSlug);
  return presets[Math.floor(presets.length / 2)];
}

export const DEFAULT_ROOM: RoomConfig = {
  length: 350,
  width: 400,
  height: 270,
  wallColor: 'SKY',
  floorType: 'WOOD',
};

/** Màu pastel đơn giản cho tường và sàn, theo yêu cầu hiện tại. */
export const WALL_SWATCHES: { value: WallPreset; label: string; hex: string }[] = [
  { value: 'SKY', label: 'Xanh nhạt', hex: '#dcecf5' },
  { value: 'WHITE', label: 'Trắng', hex: '#ffffff' },
  { value: 'BLUSH', label: 'Hồng phấn nhạt', hex: '#fbeff0' },
  { value: 'PINK', label: 'Hồng pastel', hex: '#f6d3d9' },
];

export function wallHex(color: WallColor): string {
  if (color.startsWith('#')) return color;
  return WALL_SWATCHES.find((swatch) => swatch.value === color)?.hex ?? '#ffffff';
}

export const FLOOR_OPTIONS: { value: FloorType; label: string }[] = [
  { value: 'WOOD', label: 'Sàn gỗ' },
  { value: 'TILE', label: 'Sàn gạch' },
];

export const FLOOR_PALETTE: Record<FloorType, { base: string; line: string }> = {
  WOOD: { base: '#eadbc8', line: '#d6c3a8' },
  TILE: { base: '#e2e9ee', line: '#f7f9fa' },
};

export function formatVnd(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} VNĐ`;
}

/** Đổi cm sang mét để hiển thị, ví dụ 350 -> "3.5". */
export function formatMeters(cm: number): string {
  return String(Number((cm / 100).toFixed(2)));
}

export function newUid(): string {
  return crypto.randomUUID();
}
