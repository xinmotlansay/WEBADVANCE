import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RoleName } from 'shared';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { ROLE_LABELS } from '../../core/navigation/admin-nav.config';
import { MarketingDashboardComponent } from '../marketing/dashboard/marketing-dashboard.component';

/** Trang chủ tạm trong khung Admin; dashboard theo vai trò (AD-02...) làm ở các nhiệm vụ sau. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [MarketingDashboardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AdminAuthService);

  readonly user = this.auth.user;
  /** Marketing Admin có dashboard riêng (FR-MKT_AD-002); vai trò khác còn trang tạm. */
  readonly isMarketing = computed(() => this.user()?.roleName === RoleName.MARKETING_ADMIN);
  readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.roleName ?? ''] ?? 'Quản trị viên');
}
