import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { SessionIdleService } from '../../core/auth/session-idle.service';
import { ADMIN_NAV, ROLE_LABELS } from '../../core/navigation/admin-nav.config';
import { AdminSidebarComponent } from '../admin-sidebar/admin-sidebar.component';
import { ToastHostComponent } from '../../shared/ui/toast';

/** Khung chung của mọi màn sau đăng nhập: sidebar bên trái, nội dung bên phải, theo dõi phiên 30 phút. */
@Component({
  selector: 'app-admin-shell',
  imports: [AdminSidebarComponent, RouterOutlet, ToastHostComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent implements OnInit {
  private readonly auth = inject(AdminAuthService);
  private readonly idle = inject(SessionIdleService);

  readonly user = this.auth.user;
  readonly warningSecondsLeft = this.idle.warningSecondsLeft;

  readonly navItems = computed(() => ADMIN_NAV[this.user()?.roleName ?? ''] ?? []);
  readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.roleName ?? ''] ?? 'Quản trị viên');

  ngOnInit(): void {
    this.idle.start();
  }

  extendSession(): void {
    this.idle.extend();
  }

  logout(): void {
    this.idle.stop();
    this.auth.logout();
  }
}
