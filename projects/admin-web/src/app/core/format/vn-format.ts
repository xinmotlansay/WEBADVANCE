/** Định dạng số, tiền, ngày kiểu Việt Nam (admin-ui-rule mục 3). */
const TZ = 'Asia/Ho_Chi_Minh';

const numberFmt = new Intl.NumberFormat('vi-VN');
const oneDecimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dayMonthFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'long' });

/** `24900000` → `24.900.000đ` */
export function formatMoney(value: number): string {
  return `${numberFmt.format(value)}đ`;
}

export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

/** Tiền rút gọn cho số lớn: `8,6tr`, `3,74 tỷ`. */
export function formatMoneyShort(value: number): string {
  if (Math.abs(value) >= 1e9) return `${twoDecimals.format(value / 1e9)} tỷ`;
  if (Math.abs(value) >= 1e6) return `${oneDecimal.format(value / 1e6)}tr`;
  return formatMoney(value);
}

/** `4.2` → `4,2%` */
export function formatPercent(value: number): string {
  return `${oneDecimal.format(value)}%`;
}

export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

export function formatDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso));
}

/** `29/10`. Ghép tay vì một số trình duyệt định dạng vi-VN không có năm thành `29-10`. */
export function formatDayMonth(iso: string | Date): string {
  const parts = dayMonthFmt.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}`;
}

export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | Date): string {
  return `${formatTime(iso)} ${formatDate(iso)}`;
}

/** Tiêu đề trang dashboard: `Thứ Năm, 29/10/2026`. */
export function formatLongDate(at: Date): string {
  const weekday = weekdayFmt.format(at);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDate(at)}`;
}

/** Thời gian chờ: `372` phút → `6g 12p`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)} ngày ${hours % 24}g`;
  return hours > 0 ? `${hours}g ${rest}p` : `${rest}p`;
}

/** Chữ cái đầu và cuối của tên: "Nguyễn Hoà" → "NH". */
export function initialsOf(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
