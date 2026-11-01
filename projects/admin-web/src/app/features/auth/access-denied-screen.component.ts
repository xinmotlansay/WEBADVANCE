import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui/states/state-components';

@Component({
  selector: 'app-access-denied-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent],
  template: `
    <main class="cv-page">
      <app-empty-state
        icon="shield"
        title="Bạn chưa được cấp quyền"
        message="Tài khoản này không có chức năng quản trị đơn hàng. Vui lòng liên hệ quản trị viên."
      />
    </main>
  `,
})
export class AccessDeniedScreenComponent {}
