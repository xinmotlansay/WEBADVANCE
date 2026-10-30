import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Id icon theo Iconify (`bộ:tên`). File SVG tương ứng nằm ở `public/icons/<bộ>-<tên>.svg`. */
export type IconName =
  | 'lucide:search'
  | 'lucide:camera'
  | 'lucide:heart'
  | 'lucide:user'
  | 'lucide:shopping-cart'
  | 'lucide:chevron-down'
  | 'lucide:chevron-left'
  | 'lucide:chevron-right'
  | 'lucide:zap'
  | 'lucide:chevron-up'
  | 'lucide:x'
  | 'lucide:sparkles'
  | 'lucide:check'
  | 'lucide:minus'
  | 'lucide:plus'
  | 'lucide:trash-2'
  | 'lucide:hand-coins'
  | 'lucide:qr-code'
  | 'mdi:chat-processing'
  | 'simple-icons:youtube'
  | 'simple-icons:tiktok'
  | 'simple-icons:instagram'
  | 'simple-icons:facebook';

/** Icon SVG cục bộ, tô màu theo `currentColor` bằng mask. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.--icon-url]': 'url()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: '',
  styles: `
    :host {
      display: inline-block;
      flex: none;
      background-color: currentColor;
      -webkit-mask: var(--icon-url) no-repeat center / contain;
      mask: var(--icon-url) no-repeat center / contain;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(24);

  protected readonly url = computed(() => `url('/icons/${this.name().replace(':', '-')}.svg')`);
}
