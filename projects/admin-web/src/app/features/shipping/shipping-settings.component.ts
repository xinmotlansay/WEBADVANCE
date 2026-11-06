import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { SuperAdminApiService } from '../../services/super-admin/super-admin-api.service';
import { ConfigEditor } from '../super-admin/system/config-editor';
import { ConfigFieldsComponent } from '../super-admin/system/config-fields.component';

/**
 * Phí vận chuyển theo cấp, số ngày chuẩn bị, khung giờ giao, giới hạn đổi lịch và số lần giao lại.
 * Trước đây nằm ở Cấu hình hệ thống; nay chỉnh ngay tại màn Vận chuyển & lịch giao (chỉ Admin cấp cao),
 * vẫn đi qua cùng API và ghi nhật ký như mọi cấu hình khác.
 */
@Component({
  selector: 'app-shipping-settings',
  imports: [ConfigFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shipping-settings.component.css',
  template: `
    <dialog #dialog class="cv-dialog settings" aria-labelledby="ship-settings-title">
      <form (submit)="$event.preventDefault(); save()">
        <header class="head">
          <div>
            <h2 id="ship-settings-title">Phí và lịch giao</h2>
            <p class="cv-hint">Áp dụng cho đơn đặt từ lần thanh toán tiếp theo.</p>
          </div>
          <button type="button" class="cv-btn" (click)="close()">Đóng</button>
        </header>

        @if (editor.error()) {
          <div class="cv-alert" role="alert">
            <span>Không tải được cấu hình. {{ editor.error() }}</span>
            <button type="button" class="cv-btn" (click)="editor.load()">Thử lại</button>
          </div>
        }

        @if (editor.loading() && !editor.groups()) {
          <span class="cv-skeleton tall"></span>
        }

        @for (group of editor.groups() ?? []; track group.key) {
          @for (item of group.items; track item.key) {
            <section class="item">
              @if (item.fields.length > 1) {
                <h3>{{ item.label }}</h3>
              }
              <app-config-fields [item]="item" [value]="editor.drafts()[item.key]" (valueChange)="editor.setDraft(item.key, $event)" />
            </section>
          }

          @if (error(group); as message) {
            <div class="cv-alert" role="alert">{{ message }}</div>
          }

          <footer class="foot">
            @if (editor.savedGroup() === group.key) {
              <span class="ok" role="status">Đã lưu</span>
            } @else if (editor.dirtyItems(group).length > 0) {
              <span class="cv-hint" role="status">{{ editor.dirtyItems(group).length }} mục chưa lưu</span>
            }
            <button type="button" class="cv-btn" [disabled]="editor.dirtyItems(group).length === 0" (click)="editor.reset(group)">Hoàn tác</button>
            <button type="submit" class="cv-btn primary" [disabled]="editor.dirtyItems(group).length === 0 || editor.saving() === group.key">Lưu thay đổi</button>
          </footer>
        }
      </form>
    </dialog>
  `,
})
export class ShippingSettingsComponent {
  protected readonly editor = new ConfigEditor(inject(SuperAdminApiService), (g) => g.key === 'shipping');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly loaded = signal(false);

  open(): void {
    if (!this.loaded()) {
      this.loaded.set(true);
      this.editor.load();
    }
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected save(): void {
    const group = this.editor.groups()?.[0];
    if (group) void this.editor.save(group);
  }

  protected error(group: { items: { key: string }[] }): string | null {
    const errors = this.editor.itemErrors();
    return group.items.map((i) => errors[i.key]).find(Boolean) ?? null;
  }
}
