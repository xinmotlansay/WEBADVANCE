import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="cv-empty">
      <app-icon [name]="icon()" size="lg" />
      <p class="cv-empty__title">{{ title() }}</p>
      <p>{{ message() }}</p>
      @if (actionLabel()) {
        <button type="button" class="cv-btn cv-btn--secondary" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}

@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="cv-empty" role="alert">
      <app-icon name="circle-alert" size="lg" />
      <p class="cv-empty__title">Không tải được dữ liệu</p>
      <p>{{ message() }}</p>
      <button type="button" class="cv-btn cv-btn--secondary" (click)="retry.emit()">Thử lại</button>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}

@Component({
  selector: 'app-table-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cv-stack" aria-hidden="true" style="padding: 8px 0">
      @for (row of rows(); track row) {
        <div class="cv-skeleton" style="height: 48px"></div>
      }
    </div>
    <span class="sr-only">Đang tải dữ liệu</span>
  `,
})
export class TableSkeletonComponent {
  readonly rows = input<number[]>([1, 2, 3, 4, 5, 6]);
}
