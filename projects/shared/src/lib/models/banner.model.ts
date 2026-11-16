import type { ImageFocus } from './image-focus';

export type BannerPosition = 'HOME_SLIDER' | 'HOME_MIDDLE' | 'CATEGORY' | 'POPUP';
export type PopupFrequency = 'SESSION' | 'DAILY' | 'ONCE';

export interface Banner {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  /** Trống thì dùng `imageUrl`. */
  mobileImageUrl: string;
  /** Vùng hiển thị ảnh desktop / mobile; null = căn giữa. */
  imageFocus: ImageFocus | null;
  mobileImageFocus: ImageFocus | null;
  linkUrl: string;
  /** Trống thì client dùng "Xem thêm". */
  ctaLabel: string;
  openInNewTab: boolean;
  popupFrequency: PopupFrequency | null;
}
