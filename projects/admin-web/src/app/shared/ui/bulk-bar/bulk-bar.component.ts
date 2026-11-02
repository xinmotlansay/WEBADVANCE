import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-bulk-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (count() > 0) {
      <div class="cv-bulkbar" role="toolbar" aria-label="Thao tác hàng loạt">
        <button
          type="button"
          class="cv-icon-btn cv-icon-btn--on-navy"
          aria-label="Bỏ chọn tất cả"
          (click)="cleared.emit()"
        >
          <app-icon name="x" size="sm" />
        </button>
        <span class="cv-bulkbar__count">Đã chọn: {{ count() }}</span>
        <ng-content />
      </div>
    }
  `,
})
export class BulkBarComponent {
  readonly count = input(0);
  readonly cleared = output<void>();
}
