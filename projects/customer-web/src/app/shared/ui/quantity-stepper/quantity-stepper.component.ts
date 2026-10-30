import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icons/icon.component';

/** Ô số lượng có nút − / +. Không tự giữ giá trị: cha nhận `changed` rồi truyền lại `value`. */
@Component({
  selector: 'app-quantity-stepper',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      aria-label="Giảm số lượng"
      [disabled]="disabled() || value() <= min()"
      (click)="changed.emit(value() - 1)"
    >
      <app-icon name="lucide:minus" [size]="16" />
    </button>
    <span class="value" aria-live="polite">{{ value() }}</span>
    <button
      type="button"
      aria-label="Tăng số lượng"
      [disabled]="disabled() || (max() !== null && value() >= max()!)"
      (click)="changed.emit(value() + 1)"
    >
      <app-icon name="lucide:plus" [size]="16" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      height: 36px;
      border: 1px solid var(--color-gray);
      border-radius: 3px;
    }
    button {
      display: grid;
      place-items: center;
      width: 36px;
      height: 100%;
      padding: 0;
      border: 0;
      background: none;
    }
    button:disabled {
      cursor: not-allowed;
      color: var(--color-gray);
    }
    button:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: -2px;
    }
    .value {
      min-width: 32px;
      text-align: center;
      font-size: var(--font-size-h5);
      font-weight: var(--font-weight-medium);
    }
  `,
})
export class QuantityStepperComponent {
  readonly value = input.required<number>();
  readonly min = input(1);
  /** `null` là không giới hạn phía client (server vẫn chặn vượt tồn). */
  readonly max = input<number | null>(null);
  readonly disabled = input(false);
  readonly changed = output<number>();
}
