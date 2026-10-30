import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NAV_ICONS, type NavIconName } from '../../core/navigation/nav-icons';

/** Icon nét 1.8, 20px (admin-ui-rule mục 4); chỉ trang trí nên luôn `aria-hidden`. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display: contents' },
  template: `<svg class="icon" [class.sm]="small()" viewBox="0 0 24 24"><path [attr.d]="path()" /></svg>`,
})
export class IconComponent {
  readonly name = input.required<NavIconName>();
  readonly small = input(false);
  protected readonly path = computed(() => NAV_ICONS[this.name()]);
}
