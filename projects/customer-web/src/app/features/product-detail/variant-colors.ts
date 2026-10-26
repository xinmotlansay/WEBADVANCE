/** Mã màu hiển thị cho ô chọn màu khi biến thể chưa có ảnh riêng (khóa theo `product_variants.color`). */
const VARIANT_SWATCHES: Record<string, string> = {
  'trắng': '#f5f4f0',
  'trắng ngà': '#efe8d8',
  'kem': '#ece3cf',
  'be': '#d9c7a8',
  'xám': '#9a9c9e',
  'xám nhạt': '#c7c9cb',
  'xám khói': '#7d8084',
  'đen': '#232425',
  'nâu bò': '#9b5b34',
  'óc chó': '#5d3d26',
  'gỗ sồi': '#c49a6c',
  'gỗ sáng': '#d8b98e',
  'gỗ tự nhiên': '#b98b5b',
  'mây tự nhiên': '#cfae7b',
  'đồng': '#b0703f',
  'xanh rêu': '#4f5d3a',
  'vàng mù tạt': '#d1a12a',
};

const FALLBACK_SWATCH = '#d3d5d6';

export function variantSwatch(colorName: string): string {
  return VARIANT_SWATCHES[colorName.trim().toLowerCase()] ?? FALLBACK_SWATCH;
}
