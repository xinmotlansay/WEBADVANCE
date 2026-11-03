import { money } from '../vouchers/voucher-format';
import type { PromotionRow, PromotionStatus } from './promotion.api';

export const PROMO_LABEL: Record<PromotionStatus, string> = {
  RUNNING: 'Đang diễn ra',
  UPCOMING: 'Sắp diễn ra',
  PAUSED: 'Tạm dừng',
  DRAFT: 'Nháp',
  ENDED: 'Đã kết thúc',
};

export const PROMO_BADGE: Record<PromotionStatus, string> = {
  RUNNING: 'cv-badge--success',
  UPCOMING: 'cv-badge--info',
  PAUSED: 'cv-badge--attention',
  DRAFT: '',
  ENDED: '',
};

export const PROMO_REASONS = [
  { value: 'OUT_OF_BUDGET', label: 'Hết ngân sách' },
  { value: 'WRONG_CONFIG', label: 'Sai cấu hình' },
  { value: 'PLAN_CHANGED', label: 'Thay đổi kế hoạch' },
  { value: 'OUT_OF_STOCK', label: 'Sản phẩm hết hàng' },
  { value: 'OTHER', label: 'Khác' },
];

export const WARNING_TEXT: Record<string, string> = {
  PRODUCT_UNAVAILABLE: 'Sản phẩm đang ẩn hoặc ngừng kinh doanh',
  OUT_OF_STOCK: 'Hết hàng',
  PRICE_CHANGED: 'Giá gốc đã thay đổi',
};

export function promoDiscountText(
  p: Pick<PromotionRow, 'discountType' | 'discountValue' | 'maxDiscountValue'>,
): string {
  if (!p.discountType || p.discountValue == null) return '—';
  return p.discountType === 'PERCENT'
    ? `${p.discountValue}%${p.maxDiscountValue ? ` (tối đa ${money(p.maxDiscountValue)})` : ''}`
    : money(p.discountValue);
}

/** CSV UTF-8 có BOM; ô bắt đầu bằng = + - @ được thêm dấu nháy để chặn công thức độc hại. */
export function promotionsToCsv(rows: PromotionRow[]): string {
  const cell = (v: string | number): string => {
    const t = String(v);
    return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  };
  const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
  const head = [
    'Mã KM',
    'Tên',
    'Loại',
    'Mức giảm',
    'Số mục áp dụng',
    'Bắt đầu',
    'Kết thúc',
    'Trạng thái',
    'Số đơn',
  ];
  const lines = rows.map((r) =>
    [
      r.code,
      r.name,
      r.scopeType === 'PRODUCT' ? 'Giảm giá sản phẩm' : 'Giảm giá danh mục',
      promoDiscountText(r),
      r.scopeCount,
      date(r.startDate),
      date(r.endDate),
      PROMO_LABEL[r.status],
      r.orderCount,
    ]
      .map(cell)
      .join(','),
  );
  return '\uFEFF' + [head.map(cell).join(','), ...lines].join('\r\n');
}
