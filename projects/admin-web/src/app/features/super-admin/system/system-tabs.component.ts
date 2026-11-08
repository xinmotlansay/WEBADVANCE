import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Tab chuyển giữa Nhật ký hoạt động và Cấu hình hệ thống (mục menu "Nhật ký & cấu hình"). */
@Component({
  selector: 'app-sa-system-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="cv-tabs" aria-label="Nhật ký và cấu hình">
      <a class="cv-tab" routerLink="/nhat-ky-cau-hinh/nhat-ky" routerLinkActive="on" ariaCurrentWhenActive="page">Nhật ký hoạt động</a>
      <a class="cv-tab" routerLink="/nhat-ky-cau-hinh/cau-hinh" routerLinkActive="on" ariaCurrentWhenActive="page">Cấu hình hệ thống</a>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemTabsComponent {}
