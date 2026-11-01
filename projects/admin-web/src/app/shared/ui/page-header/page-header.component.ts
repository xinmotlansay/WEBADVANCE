import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Đầu trang dùng chung: h1 34/600 + phụ đề, ô tìm kiếm 230px, chuông 36px,
 * vùng nút hành động do trang chiếu vào. Theo admin-ui-rule mục 3/6.
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <header class="cv-page-header">
      <div class="cv-page-header__title">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="cv-page-header__sub">{{ subtitle() }}</p>
        }
      </div>

      @if (showSearch()) {
        <div class="cv-search">
          <label class="sr-only" [attr.for]="searchId()">{{ searchLabel() }}</label>
          <input
            class="cv-input cv-search__input"
            [id]="searchId()"
            type="search"
            [placeholder]="searchPlaceholder()"
            [value]="searchValue()"
            (input)="searchChange.emit($any($event.target).value)"
          />
        </div>
      }

      <button
        type="button"
        class="cv-icon-btn"
        aria-label="Thông báo"
        title="Thông báo"
        (click)="notificationsClick.emit()"
      >
        <app-icon name="bell" size="sm" />
        @if (hasNotifications()) {
          <span class="cv-icon-btn__dot" aria-hidden="true"></span>
        }
      </button>

      <ng-content />
    </header>
  `,
  styles: [
    `
      .cv-search__input {
        width: 100%;
        height: 38px;
        padding-left: 12px;
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly showSearch = input(true);
  readonly searchId = input('page-search');
  readonly searchLabel = input('Tìm kiếm');
  readonly searchPlaceholder = input('Tìm kiếm…');
  readonly searchValue = input('');
  readonly hasNotifications = input(false);

  readonly searchChange = output<string>();
  readonly notificationsClick = output<void>();
}
