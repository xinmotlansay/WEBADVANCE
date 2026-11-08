import { Pipe, PipeTransform } from '@angular/core';

const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

@Pipe({ name: 'vnd', standalone: true })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `${VND.format(value)}đ`;
  }
}

@Pipe({ name: 'shortVnd', standalone: true })
export class ShortVndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    if (Math.abs(value) >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2).replace('.', ',')} tỷ`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace('.', ',')}tr`;
    }
    return `${VND.format(value)}đ`;
  }
}

@Pipe({ name: 'percentVn', standalone: true })
export class PercentVnPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined) return '—';
    return `${value.toFixed(digits).replace('.', ',')}%`;
  }
}

@Pipe({ name: 'dateVn', standalone: true })
export class DateVnPipe implements PipeTransform {
  transform(value: string | Date | null | undefined, mode: 'date' | 'short' | 'datetime' = 'date'): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    if (mode === 'short') return `${dd}/${mm}`;
    if (mode === 'datetime') return `${hh}:${mi} ${dd}/${mm}/${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }
}

@Pipe({ name: 'orderCode' })
export class OrderCodePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    return value.startsWith('#') ? value : `#${value}`;
  }
}
