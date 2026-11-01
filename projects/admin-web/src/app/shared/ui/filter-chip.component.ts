import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

let nextId = 0;

/**
 * Chip lọc (admin-ui-rule mục 6): viền nét đứt, đang lọc thì nền navy kèm số điều kiện.
 * Bấm để mở danh sách; `multiple` chọn nhiều bằng checkbox, ngược lại chọn một.
 */
@Component({
  selector: 'app-filter-chip',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chip-host',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close(true)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="chip"
      [class.on]="selected().length > 0"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="open.set(!open())"
    >
      <span>{{ label() }}</span>
      @if (selected().length) {
        <span class="count">{{ summary() }}</span>
      }
      <app-icon name="chevronDown" [small]="true" />
    </button>
    @if (open()) {
      <div class="menu" [id]="panelId" role="group" [attr.aria-label]="label()">
        @for (option of options(); track option.value) {
          <label class="opt">
            <input
              [type]="multiple() ? 'checkbox' : 'radio'"
              [name]="panelId"
              [checked]="selected().includes(option.value)"
              (change)="toggle(option.value)"
            />
            <span class="opt-label">{{ option.label }}</span>
            @if (option.count !== undefined) {
              <span class="opt-count">{{ option.count }}</span>
            }
          </label>
        } @empty {
          <p class="empty">Không có lựa chọn.</p>
        }
        @if (selected().length) {
          <div class="menu-foot">
            <button type="button" class="btn-link" (click)="clear()">Bỏ lọc</button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px;
      border: 1px dashed var(--cv-chip-dash);
      border-radius: var(--cv-radius);
      background: var(--cv-surface);
      color: var(--cv-navy);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--cv-navy);
    }
    .chip.on {
      border: 1px solid var(--cv-navy);
      background: var(--cv-navy);
      color: var(--cv-surface);
    }
    .count {
      min-width: 18px;
      padding: 0 4px;
      border-radius: var(--cv-radius-sm);
      background: var(--cv-accent);
      color: var(--cv-navy);
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      text-align: center;
    }
    .menu {
      position: absolute;
      z-index: 20;
      top: calc(100% + 4px);
      left: 0;
      min-width: 220px;
      max-height: 320px;
      overflow-y: auto;
      padding: 4px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      box-shadow: var(--cv-shadow);
    }
    .opt {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 0 8px;
      border-radius: var(--cv-radius);
      font-size: 13px;
      cursor: pointer;
    }
    .opt:hover {
      background: var(--cv-surface-alt);
    }
    .opt input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--cv-navy);
    }
    .opt-label {
      flex: 1;
      white-space: nowrap;
    }
    .opt-count {
      color: var(--cv-muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .menu-foot {
      padding: 8px 8px 4px;
      border-top: 1px solid var(--cv-line-soft);
      margin-top: 4px;
    }
    .empty {
      margin: 0;
      padding: 8px;
      font-size: 13px;
      color: var(--cv-muted);
    }
  `,
})
export class FilterChipComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly label = input.required<string>();
  readonly options = input<ChipOption[]>([]);
  readonly multiple = input(true);
  readonly selected = model<string[]>([]);

  protected readonly open = signal(false);
  protected readonly panelId = `chip-menu-${nextId++}`;

  /** Chọn một thì hiện tên lựa chọn, chọn nhiều thì hiện số điều kiện. */
  protected readonly summary = computed(() => {
    const values = this.selected();
    if (this.multiple() || values.length !== 1) return values.length;
    return this.options().find((o) => o.value === values[0])?.label ?? 1;
  });

  protected toggle(value: string): void {
    if (!this.multiple()) {
      this.selected.set(this.selected()[0] === value ? [] : [value]);
      this.close(true);
      return;
    }
    const current = this.selected();
    this.selected.set(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  }

  protected clear(): void {
    this.selected.set([]);
    this.close(true);
  }

  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger()?.nativeElement.focus();
  }

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
