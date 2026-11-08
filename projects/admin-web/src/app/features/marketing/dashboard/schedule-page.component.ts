import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PublishCalendarComponent } from './publish-calendar.component';

/** Màn "Lịch đăng": xem, đổi giờ, hủy lịch các nội dung đã hẹn đăng. */
@Component({
  selector: 'app-schedule-page',
  imports: [PublishCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="cv-main">
      <header class="cv-page-head"><h1>Lịch đăng</h1></header>
      <app-publish-calendar />
    </main>
  `,
})
export class SchedulePageComponent {}
