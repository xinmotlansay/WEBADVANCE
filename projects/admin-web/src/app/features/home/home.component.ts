import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RoleName } from 'shared';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { ProductsComponent } from '../products/products.component';
import { DashboardComponent } from '../dashboard/dashboard.component';

/** Trang chủ theo vai trò (ma trận mục 5): Product Admin → Sản phẩm; còn lại vào dashboard (Admin cấp cao → Tổng quan mới). */
@Component({
  selector: 'app-home',
  imports: [ProductsComponent, DashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (role()) {
      @case (roles.PRODUCT_ADMIN) {
        <app-products />
      }
      @default {
        <app-admin-dashboard />
      }
    }
  `,
})
export class HomeComponent {
  protected readonly roles = RoleName;
  private readonly auth = inject(AdminAuthService);
  protected readonly role = computed(() => this.auth.user()?.roleName ?? '');
}
