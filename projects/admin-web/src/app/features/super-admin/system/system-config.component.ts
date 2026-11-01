import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import * as fmt from '../../../core/format/vn-format';
import { SuperAdminApiService } from '../super-admin-api.service';
import type { ConfigField, ConfigGroup, ConfigItem } from '../super-admin.models';
import { SystemTabsComponent } from './system-tabs.component';

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

function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | null)?.[key], value);
}

/** Gán giá trị theo đường dẫn trên bản sao, không sửa object gốc. */
function setPath(value: unknown, path: string, next: unknown): unknown {
  if (!path) return next;
  const root = structuredClone(value) as Record<string, unknown>;
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[keys[keys.length - 1]] = next;
  return root;
}

/** Cấu hình hệ thống (AD-15): mỗi khóa một khối, lưu riêng từng khối, mọi thay đổi ghi nhật ký. */
@Component({
  selector: 'app-sa-system-config',
  imports: [SystemTabsComponent],
  templateUrl: './system-config.component.html',
  styleUrl: './system.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemConfigComponent {
  private readonly api = inject(SuperAdminApiService);

  readonly fmt = fmt;
  readonly weekdays = WEEKDAYS;

  readonly groups = signal<ConfigGroup[] | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly drafts = signal<Record<string, unknown>>({});
  readonly saving = signal<string | null>(null);
  readonly itemErrors = signal<Record<string, string>>({});
  readonly saved = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .systemConfigs()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (groups) => {
          this.groups.set(groups);
          this.drafts.set(Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.key, structuredClone(i.value)]))));
        },
        error: (err: unknown) => this.error.set(parseApiError(err).message),
      });
  }

  read(item: ConfigItem, field: ConfigField): unknown {
    return getPath(this.drafts()[item.key], field.path);
  }

  /** Tỷ lệ lưu dạng 0–1, hiển thị dạng phần trăm. */
  display(item: ConfigItem, field: ConfigField): string | number {
    const value = this.read(item, field);
    if (field.type === 'percent' && typeof value === 'number') return Math.round(value * 10000) / 100;
    return (value as string | number | undefined) ?? '';
  }

  write(item: ConfigItem, field: ConfigField, raw: string | boolean): void {
    let next: unknown = raw;
    if (['number', 'money', 'percent'].includes(field.type)) {
      const num = raw === '' ? NaN : Number(raw);
      next = field.type === 'percent' ? Math.round(num * 100) / 10000 : num;
    }
    this.drafts.update((d) => ({ ...d, [item.key]: setPath(d[item.key], field.path, next) }));
    this.clearError(item.key);
  }

  hasDay(item: ConfigItem, field: ConfigField, day: number): boolean {
    return ((this.read(item, field) as number[] | undefined) ?? []).includes(day);
  }

  toggleDay(item: ConfigItem, field: ConfigField, day: number): void {
    const days = new Set((this.read(item, field) as number[] | undefined) ?? []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    this.drafts.update((d) => ({ ...d, [item.key]: setPath(d[item.key], field.path, [...days].sort()) }));
    this.clearError(item.key);
  }

  isDirty(item: ConfigItem): boolean {
    return JSON.stringify(this.drafts()[item.key]) !== JSON.stringify(item.value);
  }

  reset(item: ConfigItem): void {
    this.drafts.update((d) => ({ ...d, [item.key]: structuredClone(item.value) }));
    this.clearError(item.key);
  }

  save(item: ConfigItem): void {
    const value = this.drafts()[item.key];
    this.saving.set(item.key);
    this.clearError(item.key);
    this.api
      .updateSystemConfig(item.key, value)
      .pipe(finalize(() => this.saving.set(null)))
      .subscribe({
        next: (res) => {
          this.groups.update((groups) =>
            (groups ?? []).map((g) => ({
              ...g,
              items: g.items.map((i) =>
                i.key === item.key
                  ? { ...i, value: res.value, isDefault: false, updatedAt: new Date().toISOString(), updatedByName: 'Bạn' }
                  : i,
              ),
            })),
          );
          this.drafts.update((d) => ({ ...d, [item.key]: structuredClone(res.value) }));
          this.saved.set(item.key);
          setTimeout(() => this.saved() === item.key && this.saved.set(null), 4000);
        },
        error: (err: unknown) => {
          const parsed = parseApiError(err);
          this.itemErrors.update((e) => ({ ...e, [item.key]: this.describe(item, err, parsed.message) }));
        },
      });
  }

  scrollTo(groupKey: string): void {
    const section = document.getElementById(`nhom-${groupKey}`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
  }

  inputId(item: ConfigItem, field: ConfigField): string {
    return `cfg-${item.key}-${field.path}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  /** Lỗi validate trả `value.<path>`: nêu đúng tên ô bị sai. */
  private describe(item: ConfigItem, err: unknown, fallback: string): string {
    const details = (err as { error?: { error?: { details?: { field?: string; issue?: string }[] } } })?.error?.error?.details;
    const first = Array.isArray(details) ? details[0] : undefined;
    if (!first?.field) return fallback;
    const path = first.field.replace(/^value\.?/, '');
    const field = item.fields.find((f) => f.path === path);
    return field ? `${field.label}: ${first.issue}` : fallback;
  }

  private clearError(key: string): void {
    if (this.itemErrors()[key]) this.itemErrors.update(({ [key]: _, ...rest }) => rest);
  }
}
