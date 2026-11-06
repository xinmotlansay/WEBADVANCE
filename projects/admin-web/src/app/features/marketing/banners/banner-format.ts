import type { BannerPosition, BannerStatus } from './banner.api';

export const POSITION_ORDER: BannerPosition[] = ['HOME_SLIDER', 'HOME_MIDDLE', 'CATEGORY', 'POPUP'];

/** Tên vị trí cố định phía client: tab hiện đúng tiếng Việt ngay cả khi danh sách đang tải. */
export const POSITION_LABEL: Record<BannerPosition, string> = {
  HOME_SLIDER: 'Slider trang chủ',
  HOME_MIDDLE: 'Banner giữa trang chủ',
  CATEGORY: 'Banner trang danh mục',
  POPUP: 'Popup',
};
export const RECOMMENDED: Record<BannerPosition, string> = {
  HOME_SLIDER: '1920 × 700 (tối thiểu 1440 × 525)',
  HOME_MIDDLE: '1200 × 400',
  CATEGORY: '1200 × 300',
  POPUP: '600 × 600',
};

export const STATUS_LABEL: Record<BannerStatus, string> = {
  VISIBLE: 'Đang hiển thị',
  SCHEDULED: 'Đã lên lịch',
  HIDDEN: 'Tạm ẩn',
  DRAFT: 'Nháp',
  EXPIRED: 'Hết hạn',
};

export const STATUS_BADGE: Record<BannerStatus, string> = {
  VISIBLE: 'cv-badge--success',
  SCHEDULED: 'cv-badge--info',
  HIDDEN: 'cv-badge--attention',
  DRAFT: '',
  EXPIRED: '',
};

export const FREQUENCY_LABEL = {
  SESSION: 'Mỗi phiên',
  DAILY: 'Mỗi ngày',
  ONCE: 'Một lần duy nhất cho mỗi trình duyệt',
} as const;

export const pct = (v: number | null): string =>
  v === null ? '—' : `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
