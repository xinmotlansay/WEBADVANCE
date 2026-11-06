import { Directive, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { isExternal } from '../../../core/marketing/banner-rules';

/**
 * `<a [cvLink]="url">` cho liên kết do admin nhập: http(s) mở bằng href (kèm noopener),
 * đường dẫn nội bộ đi qua router để không tải lại trang và giữ được query string
 * (`routerLink` mã hóa mất dấu `?`).
 */
@Directive({
  selector: 'a[cvLink]',
  host: {
    '[attr.href]': 'url() || null',
    '[attr.target]': 'newTab() ? "_blank" : null',
    '[attr.rel]': 'newTab() || external() ? "noopener noreferrer" : null',
    '(click)': 'onClick($event)',
  },
})
export class LinkDirective {
  readonly url = input.required<string>({ alias: 'cvLink' });
  readonly newTab = input(false);

  private readonly router = inject(Router);
  protected readonly external = computed(() => isExternal(this.url()));

  protected onClick(event: MouseEvent): void {
    if (!this.url() || this.external() || this.newTab()) return;
    // Ctrl/Cmd/Shift + nhấp: để trình duyệt tự mở tab mới như link thường.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    void this.router.navigateByUrl(this.url());
  }
}
