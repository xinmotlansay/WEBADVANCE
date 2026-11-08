import type { VoucherRow, VoucherStatus } from '../../../services/marketing/voucher.service';

const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export const money = (n: number): string => `${vnd.format(n)} ₫`;
export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export const STATUS_LABEL: Record<VoucherStatus, string> = {
  ACTIVE: 'Đang hiệu lực',
  UPCOMING: 'Sắp hiệu lực',
  USED_UP: 'Hết lượt',
  EXPIRED: 'Hết hạn',
  DISABLED: 'Đã vô hiệu hóa',
};

export const STATUS_BADGE: Record<VoucherStatus, string> = {
  ACTIVE: 'cv-badge--success',
  UPCOMING: 'cv-badge--info',
  USED_UP: 'cv-badge--attention',
  EXPIRED: '',
  DISABLED: 'cv-badge--danger',
};

export const REASONS = [
  { value: 'LEAKED_OR_ABUSED', label: 'Mã bị lộ / lạm dụng' },
  { value: 'WRONG_CONFIG', label: 'Sai cấu hình' },
  { value: 'EARLY_END', label: 'Kết thúc chiến dịch sớm' },
  { value: 'OTHER', label: 'Khác' },
];

export function discountText(
  v: Pick<VoucherRow, 'discountType' | 'discountValue' | 'maxDiscountValue'>,
): string {
  return v.discountType === 'PERCENT'
    ? `${v.discountValue}%${v.maxDiscountValue ? ` (tối đa ${money(v.maxDiscountValue)})` : ''}`
    : money(v.discountValue);
}

/** CSV UTF-8 có BOM để Excel mở đúng tiếng Việt. */
export function toCsv(rows: VoucherRow[]): string {
  const head = [
    'Mã',
    'Tên',
    'Loại giảm',
    'Giá trị',
    'Đơn tối thiểu',
    'Đã dùng',
    'Tổng lượt',
    'Bắt đầu',
    'Kết thúc',
    'Hình thức',
    'Trạng thái',
  ];
  const cell = (s: string | number): string => {
    // Chống CSV injection: ô bắt đầu bằng = + - @ thì thêm dấu nháy.
    const t = String(s);
    return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  };
  const lines = rows.map((v) =>
    [
      v.code,
      v.name ?? '',
      v.discountType === 'PERCENT' ? 'Phần trăm' : 'Số tiền cố định',
      discountText(v),
      v.minOrderValue,
      v.usedCount,
      v.totalUsageLimit ?? '',
      dateTime(v.startDate),
      dateTime(v.endDate),
      v.visibility === 'PUBLIC' ? 'Công khai' : 'Riêng',
      STATUS_LABEL[v.status],
    ]
      .map(cell)
      .join(','),
  );
  return '\uFEFF' + [head.map(cell).join(','), ...lines].join('\r\n');
}
