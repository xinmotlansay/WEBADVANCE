import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { NavItem } from '../../core/navigation/admin-nav.config';
import { NAV_ICONS } from '../../core/navigation/nav-icons';

/**
 * Sidebar Admin (admin-ui-rule mục 5): thu nhỏ 72px, mở rộng 248px khi hover hoặc focus bên trong, đè lên nội dung.
 * Cảm ứng không có hover: chạm vào sidebar để mở, chạm ngoài để đóng. Dưới 768px là ngăn kéo mở bằng nút menu.
 */
@Component({
  selector: 'app-admin-sidebar',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSidebarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input.required<NavItem[]>();
  readonly fullName = input('');
  /** Ảnh đại diện; để trống hoặc lỗi tải thì hiện chữ viết tắt. */
  readonly avatar = input('');
  readonly roleLabel = input('');
  readonly logout = output<void>();

  readonly icons = NAV_ICONS;
  readonly avatarFailed = signal(false);
  readonly touchOpen = signal(false);
  readonly drawerOpen = signal(false);

  /** Chữ cái đầu và cuối của tên, ví dụ "Lê Minh" thành "LM". */
  readonly initials = computed(() => {
    const words = this.fullName().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase();
  });

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /** Đã chọn mục: thu sidebar lại (bỏ focus để không giữ trạng thái mở) và đóng ngăn kéo. */
  onLinkClick(event: Event): void {
    if (event.defaultPrevented) return; // lần chạm đầu trên cảm ứng chỉ mở rộng
    this.touchOpen.set(false);
    this.closeDrawer();
    (event.currentTarget as HTMLElement).blur();
  }

  onNavClick(event: Event): void {
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch && !this.touchOpen() && !this.drawerOpen()) {
      // Lần chạm đầu chỉ mở rộng sidebar, chưa kích hoạt mục bị chạm.
      event.preventDefault();
      event.stopPropagation();
      this.touchOpen.set(true);
    }
  }

  /** Mục chưa có trang: không điều hướng. */
  onInertClick(event: Event): void {
    event.preventDefault();
  }

  onLogout(): void {
    this.closeDrawer();
    this.logout.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.touchOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.touchOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.touchOpen.set(false);
    this.closeDrawer();
  }
}
