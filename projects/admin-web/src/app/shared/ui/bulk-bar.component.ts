import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Thanh thao tác hàng loạt (admin-ui-rule mục 6): chỉ hiện khi có hàng được chọn, giữa đáy cột chính.
 * Nút chính dùng class `btn-accent`, các nút còn lại `bulk-btn`.
 */
@Component({
  selector: 'app-bulk-bar',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar" role="toolbar" [attr.aria-label]="'Thao tác cho ' + count() + ' mục đã chọn'">
      <button type="button" class="clear" aria-label="Bỏ chọn tất cả" (click)="cleared.emit()">
        <app-icon name="x" [small]="true" />
      </button>
      <span class="count">Đã chọn: {{ count() }}</span>
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 25;
      bottom: 28px;
      left: calc(88px + (100vw - 88px - var(--aside-w, 340px)) / 2);
      transform: translateX(-50%);
      max-width: calc(100vw - 32px);
      animation: up 0.18s ease-out;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: var(--cv-radius-lg);
      background: var(--cv-navy);
      color: var(--cv-surface);
      box-shadow: var(--cv-shadow);
    }
    .clear {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius);
      background: var(--cv-navy-hover);
      color: var(--cv-surface);
      cursor: pointer;
    }
    .count {
      padding: 0 8px;
      font-size: 13px;
      white-space: nowrap;
    }
    :host ::ng-deep .bulk-btn {
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--cv-radius);
      background: transparent;
      color: var(--cv-surface);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    :host ::ng-deep .bulk-btn:hover:not(:disabled) {
      background: var(--cv-navy-hover);
    }
    :host ::ng-deep .btn-accent {
      height: 32px;
    }
    :host ::ng-deep button:focus-visible {
      outline-color: var(--cv-accent);
    }
    @keyframes up {
      from {
        opacity: 0;
        transform: translate(-50%, 8px);
      }
    }
    @media (max-width: 1279px) {
      :host {
        left: calc(88px + (100vw - 88px) / 2);
      }
    }
    @media (max-width: 767px) {
      :host {
        left: 50%;
      }
    }
  `,
})
export class BulkBarComponent {
  readonly count = input.required<number>();
  readonly cleared = output<void>();
}
