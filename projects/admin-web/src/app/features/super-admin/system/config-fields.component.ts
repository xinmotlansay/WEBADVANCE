import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import * as fmt from '../../../core/format/vn-format';
import type { ConfigField, ConfigItem } from '../super-admin.models';
import { getPath, setPath } from './config-editor';

/** Thứ tự hiển thị ngày làm việc: T2 → CN (giá trị 0 là Chủ nhật). */
const WEEKDAYS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];

/** Dựng ô nhập cho một khóa cấu hình theo mô tả field từ server. Không giữ trạng thái: giá trị vào/ra qua input/output. */
@Component({
  selector: 'app-config-fields',
  templateUrl: './config-fields.component.html',
  styleUrl: './config-fields.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigFieldsComponent {
  readonly item = input.required<ConfigItem>();
  readonly value = input.required<unknown>();
  readonly valueChange = output<unknown>();

  protected readonly fmt = fmt;
  protected readonly weekdays = WEEKDAYS;

  protected read(field: ConfigField): unknown {
    return getPath(this.value(), field.path);
  }

  /** Tỷ lệ lưu dạng 0–1, hiển thị dạng phần trăm; ngày chỉ giữ phần yyyy-MM-dd cho ô chọn ngày. */
  protected display(field: ConfigField): string | number {
    const value = this.read(field);
    if (field.type === 'percent' && typeof value === 'number') return Math.round(value * 10000) / 100;
    if (field.type === 'date' && typeof value === 'string') return value.slice(0, 10);
    return (value as string | number | undefined) ?? '';
  }

  /** Khóa chỉ có một ô: dùng mô tả của khóa làm gợi ý dưới ô. */
  protected hint(field: ConfigField): string {
    return field.hint ?? (this.item().fields.length === 1 ? this.item().description : '');
  }

  protected inputType(field: ConfigField): string {
    if (field.type === 'time' || field.type === 'email' || field.type === 'date') return field.type;
    return ['number', 'money', 'percent'].includes(field.type) ? 'number' : 'text';
  }

  protected write(field: ConfigField, raw: string | boolean): void {
    let next: unknown = raw;
    if (['number', 'money', 'percent'].includes(field.type)) {
      const num = raw === '' ? NaN : Number(raw);
      next = field.type === 'percent' ? Math.round(num * 100) / 10000 : num;
    }
    this.valueChange.emit(setPath(this.value(), field.path, next));
  }

  protected hasDay(field: ConfigField, day: number): boolean {
    return ((this.read(field) as number[] | undefined) ?? []).includes(day);
  }

  protected toggleDay(field: ConfigField, day: number): void {
    const days = new Set((this.read(field) as number[] | undefined) ?? []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    this.valueChange.emit(setPath(this.value(), field.path, [...days].sort()));
  }

  /** Trường đầu tiên của một cụm có tiêu đề nhỏ. */
  protected startsSection(index: number): boolean {
    const fields = this.item().fields;
    return !!fields[index].section && fields[index].section !== fields[index - 1]?.section;
  }

  protected inputId(field: ConfigField): string {
    return `cfg-${this.item().key}-${field.path}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }
}
