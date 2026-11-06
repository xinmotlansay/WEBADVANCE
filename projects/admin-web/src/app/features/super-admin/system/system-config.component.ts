import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import * as fmt from '../../../core/format/vn-format';
import { SuperAdminApiService } from '../../../services/super-admin/super-admin-api.service';
import type { ConfigGroup, ConfigItem } from '../super-admin.models';
import { ConfigEditor } from './config-editor';
import { ConfigFieldsComponent } from './config-fields.component';
import { JobManagerComponent } from './job-manager.component';
import { ShowroomManagerComponent } from './showroom-manager.component';
import { SystemTabsComponent } from './system-tabs.component';

/** Khóa `shipping` chỉnh ở màn Vận chuyển & lịch giao. */
const HIDDEN_GROUPS = new Set(['shipping']);

const SHOWROOM_SECTION = {
  key: 'showrooms',
  label: 'Vị trí cửa hàng',
  description: 'Điểm bán hiển thị trên bản đồ và trang Hệ thống showroom của website khách',
};

const JOBS_SECTION = {
  key: 'jobs',
  label: 'Tuyển dụng',
  description: 'Các vị trí hiển thị ở trang Tuyển dụng của website khách',
};

type Section =
  | { kind: 'config'; group: ConfigGroup }
  | { kind: 'showrooms' | 'jobs'; key: string; label: string; description: string };

/** Cấu hình hệ thống (AD-15): mỗi nhóm một thẻ, lưu cả nhóm một lần, mọi thay đổi ghi nhật ký. */
@Component({
  selector: 'app-sa-system-config',
  imports: [SystemTabsComponent, ConfigFieldsComponent, ShowroomManagerComponent, JobManagerComponent],
  templateUrl: './system-config.component.html',
  styleUrl: './system.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemConfigComponent {
  protected readonly fmt = fmt;
  protected readonly editor = new ConfigEditor(inject(SuperAdminApiService), (g) => !HIDDEN_GROUPS.has(g.key));

  /** Thứ tự trang: thông tin chân trang → vị trí cửa hàng → các nhóm còn lại. */
  protected readonly sections = computed<Section[]>(() => {
    const groups = this.editor.groups() ?? [];
    const sections: Section[] = groups.map((group) => ({ kind: 'config', group }));
    const showrooms: Section = { kind: 'showrooms', ...SHOWROOM_SECTION };
    const jobs: Section = { kind: 'jobs', ...JOBS_SECTION };
    // Chỉ chèn sau khi đã có dữ liệu để danh sách nhóm không nhảy.
    return groups.length ? [...sections.slice(0, 1), showrooms, jobs, ...sections.slice(1)] : [];
  });

  private readonly activeKey = signal<string | null>(null);
  private readonly pickedItem = signal<Record<string, string>>({});

  /** Chỉ hiện một nhóm tại một thời điểm; mặc định nhóm đầu tiên. */
  protected readonly active = computed<Section | null>(() => {
    const sections = this.sections();
    return sections.find((s) => this.keyOf(s) === this.activeKey()) ?? sections[0] ?? null;
  });

  constructor() {
    this.editor.load();
  }

  protected keyOf(section: Section): string {
    return section.kind === 'config' ? section.group.key : section.key;
  }

  protected labelOf(section: Section): string {
    return section.kind === 'config' ? section.group.label : section.label;
  }

  protected descriptionOf(section: Section): string {
    return section.kind === 'config' ? section.group.description : section.description;
  }

  protected isScalar(item: ConfigItem): boolean {
    return item.fields.length === 1;
  }

  /** Nhóm có nhiều khóa mới cần tiêu đề riêng cho từng khối; khóa một ô đã có nhãn của chính ô đó. */
  protected showItemTitle(group: ConfigGroup, item: ConfigItem): boolean {
    return group.items.length > 1 && !this.isScalar(item);
  }

  /** Các khối của nhóm theo tiêu đề phụ, giữ thứ tự xuất hiện. */
  /** Nhóm gồm nhiều văn bản dài (nội dung chính sách): chọn từng mục để sửa thay vì xếp hết ra một trang. */
  protected isPicker(group: ConfigGroup): boolean {
    return group.items.length > 3 && group.items.every((i) => !this.isScalar(i));
  }

  protected picked(group: ConfigGroup): ConfigItem {
    return group.items.find((i) => i.key === this.pickedItem()[group.key]) ?? group.items[0];
  }

  protected pick(group: ConfigGroup, key: string): void {
    this.pickedItem.update((p) => ({ ...p, [group.key]: key }));
  }

  protected blocks(group: ConfigGroup): { title: string | null; scalars: ConfigItem[]; objects: ConfigItem[] }[] {
    const out: { title: string | null; scalars: ConfigItem[]; objects: ConfigItem[] }[] = [];
    const items = this.isPicker(group) ? [this.picked(group)] : group.items;
    for (const item of items) {
      const title = item.subgroup;
      let block = out[out.length - 1];
      if (!block || block.title !== title || !title) {
        block = { title, scalars: [], objects: [] };
        out.push(block);
      }
      (this.isScalar(item) ? block.scalars : block.objects).push(item);
    }
    return out;
  }

  protected dirtyCount(group: ConfigGroup): number {
    return this.editor.dirtyItems(group).length;
  }

  protected lastChange(group: ConfigGroup): { at: string; by: string | null } | null {
    const latest = group.items
      .filter((i) => i.updatedAt)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
    return latest?.updatedAt ? { at: latest.updatedAt, by: latest.updatedByName } : null;
  }

  protected groupError(group: ConfigGroup): string | null {
    const errors = this.editor.itemErrors();
    return group.items.map((i) => errors[i.key]).find(Boolean) ?? null;
  }

  protected select(key: string): void {
    this.activeKey.set(key);
  }
}
