import { Pipe, PipeTransform } from '@angular/core';

/** Định dạng số liệu kiểu Việt Nam (admin-ui-rule mục 3). */
const integer = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** `24900000` → `24.900.000đ`. */
export function formatVnd(value: number | null | undefined): string {
  return value == null ? '—' : `${integer.format(value)}đ`;
}

/** Tiền rút gọn cho số lớn: `8,6tr`, `1,28 tỷ`, `850k`. */
export function formatMoneyShort(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${decimal.format(value / 1e9)} tỷ`;
  if (abs >= 1e6) return `${oneDecimal.format(value / 1e6)}tr`;
  if (abs >= 1e3) return `${integer.format(value / 1e3)}k`;
  return integer.format(value);
}

/** Tỷ lệ 0–1 → `4,2%`. */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null) return '—';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(ratio * 100)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : integer.format(value);
}

const VN_TZ = 'Asia/Ho_Chi_Minh';
const dateFull = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit' });
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** `29/10/2026`, hoặc rút gọn `29/10` trong bảng. */
export function formatDate(value: string | Date | null | undefined, short = false): string {
  if (!value) return '—';
  return (short ? dateShort : dateFull).format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  return value ? time.format(new Date(value)) : '—';
}

/** Khoảng thời gian đã trôi qua: `5g 40p`, `25p`, `2 ngày`. */
export function formatAge(from: string | Date, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
  if (minutes >= 48 * 60) return `${Math.floor(minutes / 1440)} ngày`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}g ${minutes % 60}p`;
  return `${minutes}p`;
}

/** Chữ cái đầu và cuối của tên: "Nguyễn Hoà" → "NH". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform = formatVnd;
}

@Pipe({ name: 'moneyShort' })
export class MoneyShortPipe implements PipeTransform {
  transform = formatMoneyShort;
}

@Pipe({ name: 'pct' })
export class PercentPipe implements PipeTransform {
  transform = formatPercent;
}

@Pipe({ name: 'num' })
export class NumberPipe implements PipeTransform {
  transform = formatNumber;
}

@Pipe({ name: 'vnDate' })
export class VnDatePipe implements PipeTransform {
  transform = formatDate;
}

@Pipe({ name: 'vnTime' })
export class VnTimePipe implements PipeTransform {
  transform = formatTime;
}

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform = initialsOf;
}

export const FORMAT_PIPES = [
  VndPipe,
  MoneyShortPipe,
  PercentPipe,
  NumberPipe,
  VnDatePipe,
  VnTimePipe,
  InitialsPipe,
] as const;
