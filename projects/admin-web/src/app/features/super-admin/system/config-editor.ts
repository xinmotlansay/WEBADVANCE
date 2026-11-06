import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { SuperAdminApiService } from '../../../services/super-admin/super-admin-api.service';
import type { ConfigField, ConfigGroup, ConfigItem } from '../super-admin.models';

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | null)?.[key], value);
}

/** Gán giá trị theo đường dẫn trên bản sao, không sửa object gốc. */
export function setPath(value: unknown, path: string, next: unknown): unknown {
  if (!path) return next;
  const root = structuredClone(value) as Record<string, unknown>;
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[keys[keys.length - 1]] = next;
  return root;
}

/**
 * Trạng thái chỉnh sửa cấu hình dùng chung cho trang Cấu hình hệ thống và hộp thoại phí/lịch giao ở màn Vận chuyển.
 * Mỗi khóa vẫn lưu riêng qua cùng API (nên nhật ký ghi từng khóa), nhưng người dùng bấm lưu theo cả nhóm.
 */
export class ConfigEditor {
  readonly groups = signal<ConfigGroup[] | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly drafts = signal<Record<string, unknown>>({});
  readonly itemErrors = signal<Record<string, string>>({});
  /** Nhóm đang lưu. */
  readonly saving = signal<string | null>(null);
  /** Nhóm vừa lưu xong, hiện "Đã lưu" vài giây. */
  readonly savedGroup = signal<string | null>(null);

  constructor(
    private readonly api: SuperAdminApiService,
    private readonly include: (group: ConfigGroup) => boolean = () => true,
  ) {}

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.systemConfigs().subscribe({
      next: (all) => {
        const groups = all.filter(this.include);
        this.groups.set(groups);
        this.drafts.set(Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.key, structuredClone(i.value)]))));
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(parseApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  isDirty(item: ConfigItem): boolean {
    return JSON.stringify(this.drafts()[item.key]) !== JSON.stringify(item.value);
  }

  dirtyItems(group: ConfigGroup): ConfigItem[] {
    return group.items.filter((item) => this.isDirty(item));
  }

  setDraft(key: string, value: unknown): void {
    this.drafts.update((d) => ({ ...d, [key]: value }));
    this.clearError(key);
  }

  reset(group: ConfigGroup): void {
    for (const item of this.dirtyItems(group)) this.setDraft(item.key, structuredClone(item.value));
  }

  async save(group: ConfigGroup): Promise<void> {
    this.saving.set(group.key);
    this.savedGroup.set(null);
    try {
      for (const item of this.dirtyItems(group)) {
        try {
          const res = await firstValueFrom(this.api.updateSystemConfig(item.key, this.drafts()[item.key]));
          this.groups.update((groups) =>
            (groups ?? []).map((g) => ({
              ...g,
              items: g.items.map((i) =>
                i.key === item.key ? { ...i, value: res.value, isDefault: false, updatedAt: new Date().toISOString(), updatedByName: 'Bạn' } : i,
              ),
            })),
          );
          this.setDraft(item.key, structuredClone(res.value));
        } catch (err) {
          this.itemErrors.update((e) => ({ ...e, [item.key]: this.describe(item, err) }));
          return;
        }
      }
      this.savedGroup.set(group.key);
      setTimeout(() => this.savedGroup() === group.key && this.savedGroup.set(null), 4000);
    } finally {
      this.saving.set(null);
    }
  }

  /** Lỗi validate trả `value.<path>`: nêu đúng tên ô bị sai. */
  private describe(item: ConfigItem, err: unknown): string {
    const parsed = parseApiError(err);
    const details = (err as { error?: { error?: { details?: { field?: string; issue?: string }[] } } })?.error?.error?.details;
    const first = Array.isArray(details) ? details[0] : undefined;
    if (!first?.field) return `${item.label}: ${parsed.message}`;
    const path = first.field.replace(/^value\.?/, '');
    const field = item.fields.find((f: ConfigField) => f.path === path);
    return field ? `${field.label}: ${first.issue}` : `${item.label}: ${parsed.message}`;
  }

  private clearError(key: string): void {
    if (this.itemErrors()[key]) this.itemErrors.update(({ [key]: _, ...rest }) => rest);
  }
}
