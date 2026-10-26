import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'user' | 'archive' | 'wrench' | 'map-pin' | 'heart' | 'star' | 'star-filled' | 'log-out'
  | 'clock' | 'clipboard-check' | 'truck' | 'package' | 'x-circle' | 'calendar' | 'help'
  | 'home' | 'image-plus' | 'chevron-down' | 'chevron-up' | 'search' | 'camera' | 'cart'
  | 'trash' | 'close' | 'youtube' | 'tiktok' | 'instagram' | 'facebook';

/** Bộ icon nét mảnh (theo phong cách Lucide) dùng cho header, footer và trang tài khoản. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  styles: ':host { display: inline-grid; flex: none; place-items: center; } svg { width: 100%; height: 100%; }',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth()" stroke-linecap="round" stroke-linejoin="round">
      @switch (name()) {
        @case ('user') { <svg:circle cx="12" cy="8" r="4" /><svg:path d="M4 21a8 8 0 0 1 16 0" /> }
        @case ('archive') { <svg:rect x="3" y="3" width="18" height="18" rx="1.5" /><svg:path d="M3 9h18M10 13h4" /> }
        @case ('wrench') { <svg:path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> }
        @case ('map-pin') { <svg:path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><svg:circle cx="12" cy="10" r="3" /> }
        @case ('heart') { <svg:path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /> }
        @case ('star') { <svg:path d="m12 2.5 2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95Z" /> }
        @case ('star-filled') { <svg:path fill="currentColor" d="m12 2.5 2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95Z" /> }
        @case ('log-out') { <svg:path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /> }
        @case ('clock') { <svg:circle cx="12" cy="12" r="10" /><svg:path d="M12 6v6l4 2" /> }
        @case ('clipboard-check') { <svg:rect x="8" y="2" width="8" height="4" rx="1" /><svg:path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4" /> }
        @case ('truck') { <svg:path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><svg:circle cx="17" cy="18" r="2" /><svg:circle cx="7" cy="18" r="2" /> }
        @case ('package') { <svg:path fill="currentColor" stroke="none" d="M2 10h8v4h4v-4h8v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM4.5 3H10v5H2ZM14 3h5.5L22 8h-8Z" /> }
        @case ('x-circle') { <svg:circle cx="12" cy="12" r="10" /><svg:path d="m15 9-6 6M9 9l6 6" /> }
        @case ('calendar') { <svg:rect x="3" y="4" width="18" height="18" rx="2" /><svg:path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /> }
        @case ('help') { <svg:circle fill="currentColor" stroke="none" cx="12" cy="12" r="10" /><svg:path stroke="#fff" stroke-width="2" d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" /><svg:circle fill="#fff" stroke="none" cx="12" cy="17.5" r="1.2" /> }
        @case ('home') { <svg:path fill="currentColor" stroke="none" d="M12 2.5 1.5 11H4v10h16V11h2.5ZM7 13h4v4H7Zm6 0h4v4h-4Z" fill-rule="evenodd" /> }
        @case ('image-plus') { <svg:path d="M16 5h6M19 2v6M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /><svg:circle cx="9" cy="9" r="2" /> }
        @case ('chevron-down') { <svg:path d="m6 9 6 6 6-6" /> }
        @case ('chevron-up') { <svg:path d="m18 15-6-6-6 6" /> }
        @case ('search') { <svg:circle cx="11" cy="11" r="8" /><svg:path d="m21 21-4.3-4.3" /> }
        @case ('camera') { <svg:path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z" /><svg:circle cx="12" cy="13" r="3" /> }
        @case ('cart') { <svg:circle cx="8" cy="21" r="1" /><svg:circle cx="19" cy="21" r="1" /><svg:path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /> }
        @case ('trash') { <svg:path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /> }
        @case ('close') { <svg:path d="M18 6 6 18M6 6l12 12" /> }
        @case ('youtube') { <svg:path fill="currentColor" stroke="none" fill-rule="evenodd" d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12a31 31 0 0 0 .4 4.5 3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.5 31 31 0 0 0-.4-4.5ZM9.75 15V9l5.75 3Z" /> }
        @case ('tiktok') { <svg:rect fill="currentColor" stroke="none" x="2" y="2" width="20" height="20" rx="4" /><svg:path stroke="#fff" stroke-width="2" d="M13 6v8.5a2.5 2.5 0 1 1-2.5-2.5M13 6c.5 2 2 3 4 3" /> }
        @case ('instagram') { <svg:rect fill="currentColor" stroke="none" x="2" y="2" width="20" height="20" rx="5" /><svg:circle stroke="#fff" stroke-width="2" cx="12" cy="12" r="4" /><svg:circle fill="#fff" stroke="none" cx="17.5" cy="6.5" r="1.2" /> }
        @case ('facebook') { <svg:circle fill="currentColor" stroke="none" cx="12" cy="12" r="10.5" /><svg:path stroke="#fff" stroke-width="2.2" stroke-linecap="butt" d="M15.5 7.5H14a2 2 0 0 0-2 2v13M9 13h6" /> }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.5);
}
