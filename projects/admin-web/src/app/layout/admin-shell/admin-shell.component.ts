import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { SessionIdleService } from '../../core/auth/session-idle.service';
import { AdminNavItem, navForRole } from '../../core/nav/admin-menu';
import { ROLE_LABELS } from '../../core/navigation/admin-nav.config';
import { NotificationService } from '../../core/ui/notification.service';
import { ConfirmDialogComponent } from '../../shared/ui/dialogs/confirm-dialog.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="cv-shell">
      @if (mobileOpen()) {
        <button
          type="button"
          class="cv-sidebar-backdrop"
          aria-label="Đóng menu"
          (click)="mobileOpen.set(false)"
        ></button>
      }

      <aside
        #sidebar
        id="admin-sidebar"
        class="cv-sidebar"
        [class.cv-sidebar--open]="mobileOpen()"
        [class.cv-sidebar--touch-open]="touchOpen()"
        aria-label="Menu quản trị"
        (pointerdown)="onSidebarPointerDown($event)"
      >
        <div
          class="cv-sidebar__user"
          role="group"
          [attr.aria-label]="'Tài khoản: ' + (auth.user()?.fullName ?? '') + ', ' + roleLabel()"
        >
          <span class="cv-sidebar__avatar" aria-hidden="true">{{ initials() }}</span>
          <div class="cv-sidebar__user-details">
            <div class="cv-sidebar__user-name">{{ auth.user()?.fullName }}</div>
            <div class="cv-sidebar__user-role">{{ roleLabel() }}</div>
          </div>
        </div>

        <nav class="cv-sidebar__nav" aria-label="Chức năng quản trị đơn hàng">
          @for (group of menuGroups(); track group.label; let last = $last) {
            @if (group.label) {
              <div class="cv-sidebar__group-label">{{ group.label }}</div>
            }
            @for (item of group.items; track item.route) {
              <a
                class="cv-sidebar__item"
                [routerLink]="item.route"
                routerLinkActive="cv-sidebar__item--active"
                [routerLinkActiveOptions]="{ exact: true }"
                [attr.aria-label]="item.label"
                [title]="item.label"
                (click)="mobileOpen.set(false)"
              >
                <app-icon [name]="item.icon" />
                <span class="cv-sidebar__label">{{ item.label }}</span>
              </a>
            }
            @if (!last) {
              <div class="cv-sidebar__divider"></div>
            }
          }
        </nav>

        <hr class="cv-sidebar__footer-divider" />

        <div class="cv-sidebar__footer">
          <div class="cv-sidebar__footer-brand">
            <div class="cv-sidebar__footer-logo">
              <span class="cv-sidebar__footer-mark">C</span>
              <span class="cv-sidebar__footer-name">araVeso</span>
            </div>
            <div class="cv-sidebar__footer-label">Trang quản trị</div>
          </div>
          <button
            type="button"
            class="cv-sidebar__logout"
            aria-label="Đăng xuất"
            title="Đăng xuất"
            (click)="showLogoutConfirm.set(true)"
          >
            <app-icon name="log-out" size="sm" />
          </button>
        </div>
      </aside>

      <button
        type="button"
        class="cv-icon-btn cv-mobile-toggle"
        [attr.aria-expanded]="mobileOpen()"
        aria-controls="admin-sidebar"
        aria-label="Mở menu"
        (click)="mobileOpen.set(!mobileOpen())"
      >
        <app-icon name="menu" />
      </button>

      <div class="cv-shell__body">
        <router-outlet />
      </div>
    </div>

    <app-confirm-dialog
      [open]="showLogoutConfirm()"
      title="Xác nhận đăng xuất"
      message="Bạn có chắc chắn muốn đăng xuất khỏi hệ thống quản trị không?"
      confirmLabel="Đăng xuất"
      cancelLabel="Hủy"
      [danger]="true"
      (confirmed)="confirmLogout()"
      (cancelled)="showLogoutConfirm.set(false)"
    />

    <div class="cv-toast-stack">
      @for (message of notifications.messages(); track message.id) {
        <div class="cv-toast" [class.cv-toast--error]="message.tone === 'error'" role="status">
          <app-icon
            [name]="message.tone === 'error' ? 'circle-alert' : 'circle-check'"
            size="sm"
            class="cv-toast__icon"
          />
          <span class="cv-toast__text">{{ message.text }}</span>
          <button
            type="button"
            class="cv-toast__close"
            aria-label="Đóng thông báo"
            (click)="notifications.dismiss(message.id)"
          >
            <app-icon name="x" size="sm" />
          </button>
        </div>
      }
    </div>

    @if (warningSeconds(); as seconds) {
      <div class="cv-popup-backdrop" aria-hidden="true"></div>
      <div class="cv-dialog" role="alertdialog" aria-modal="true" aria-label="Phiên sắp hết hạn">
        <header class="cv-dialog__header">Phiên đăng nhập sắp hết hạn</header>
        <div class="cv-dialog__body">
          <p>
            Bạn không thao tác trong thời gian dài. Phiên sẽ kết thúc sau
            <strong class="cv-num">{{ seconds }}</strong> giây nữa.
          </p>
        </div>
        <footer class="cv-dialog__footer">
          <button type="button" class="cv-btn cv-btn--secondary" (click)="auth.logout()">
            Đăng xuất
          </button>
          <button type="button" class="cv-btn cv-btn--primary" (click)="extendSession()">
            Tiếp tục làm việc
          </button>
        </footer>
      </div>
    }
  `,
  styles: [
    `
      .cv-mobile-toggle {
        display: none;
      }
      @media (max-width: 767px) {
        .cv-mobile-toggle {
          display: grid;
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 45;
        }
      }
    `,
  ],
})
export class AdminShellComponent {
  readonly auth = inject(AdminAuthService);
  private readonly idle = inject(SessionIdleService);
  private readonly destroyRef = inject(DestroyRef);
  readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly mobileOpen = signal(false);
  readonly touchOpen = signal(false);
  readonly showLogoutConfirm = signal(false);
  readonly menu = computed(() => navForRole(this.auth.role()));
  readonly roleLabel = computed(
    () => ROLE_LABELS[this.auth.user()?.roleName ?? ''] ?? 'Quản trị viên',
  );
  readonly initials = computed(() => {
    const name = this.auth.user()?.fullName?.trim() ?? '';
    return (
      name
        .split(/\s+/)
        .slice(-2)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase() || 'AD'
    );
  });
  readonly warningSeconds = this.idle.warningSecondsLeft;

  @ViewChild('sidebar') private sidebar?: ElementRef<HTMLElement>;

  readonly menuGroups = computed(() => {
    const groups: { label: string; items: AdminNavItem[] }[] = [];
    for (const item of this.menu()) {
      const groupLabel = item.group ?? '';
      let g = groups.find((g) => g.label === groupLabel);
      if (!g) {
        g = { label: groupLabel, items: [] };
        groups.push(g);
      }
      g.items.push(item);
    }
    return groups;
  });

  constructor() {
    this.idle.start();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.mobileOpen.set(false);
      });
  }

  confirmLogout(): void {
    this.showLogoutConfirm.set(false);
    this.auth.logout();
  }

  extendSession(): void {
    this.idle.extend();
  }

  onSidebarPointerDown(event: PointerEvent): void {
    if (
      window.matchMedia('(hover: none)').matches &&
      !window.matchMedia('(max-width: 767px)').matches &&
      !this.touchOpen() &&
      !this.mobileOpen()
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.touchOpen.set(true);
    }
  }

  @HostListener('document:click', ['$event'])
  closeTouchSidebarOnOutsideClick(event: Event): void {
    if (this.touchOpen() && !this.sidebar?.nativeElement.contains(event.target as Node)) {
      this.touchOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeSidebarsOnEscape(): void {
    this.touchOpen.set(false);
    this.mobileOpen.set(false);
  }
}
