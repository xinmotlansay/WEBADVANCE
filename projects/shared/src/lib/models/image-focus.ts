/** Vùng hiển thị của ảnh ngang, tính theo % (0–100) của ảnh gốc; khớp với `object-position`. */
export interface ImageFocus {
  x: number;
  y: number;
}

/** Chuỗi `object-position` cho ảnh; trống = căn giữa. */
export const focusPosition = (f: ImageFocus | null | undefined): string => (f ? `${f.x}% ${f.y}%` : '50% 50%');

/** Vùng hiển thị cho mobile: có ảnh mobile riêng thì dùng focus của nó, không thì dùng focus ảnh desktop. */
export const mobileFocusOf = (b: {
  mobileImageUrl?: string | null;
  imageFocus?: ImageFocus | null;
  mobileImageFocus?: ImageFocus | null;
}): ImageFocus | null => (b.mobileImageUrl ? (b.mobileImageFocus ?? null) : (b.imageFocus ?? null));
