import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RoleName } from 'shared';
import { AdminAuthService } from '../../services/auth/admin-auth.service';
import { ROLE_LABELS } from '../../core/navigation/admin-nav.config';
import { MarketingDashboardComponent } from '../marketing/dashboard/marketing-dashboard.component';
import { OverviewComponent } from '../super-admin/overview/overview.component';

/**
 * Trang chủ trong khung Admin: dashboard theo vai trò. Admin cấp cao dùng Tổng quan (AD-02); dashboard
 * Sản phẩm, Marketing, Đơn hàng (PA-02, MA-02, OA-02) bổ sung khi các vai trò đó làm xong.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [OverviewComponent, MarketingDashboardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AdminAuthService);

  /** Có khi `roleGuard` chặn đường dẫn không thuộc quyền và đưa về đây. */
  readonly khongCoQuyen = input<string | undefined>();

  readonly user = this.auth.user;
  readonly isSuperAdmin = computed(() => this.user()?.roleName === RoleName.SUPER_ADMIN);
  /** Marketing Admin có dashboard riêng (FR-MKT_AD-002). */
  readonly isMarketing = computed(() => this.user()?.roleName === RoleName.MARKETING_ADMIN);
  readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.roleName ?? ''] ?? 'Quản trị viên');
}
