import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

const SCROLL_TOP = 80;
const SCROLL_STEP = 6;

/** Header riêng của trang View your Room, theo thiết kế: nút quay lại, logo và ba icon tiện ích. */
@Component({
  selector: 'app-view-room-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.vr-hidden]': 'hidden()',
    '(window:scroll)': 'onScroll()',
  },
  templateUrl: './view-room-header.component.html',
  styleUrl: './view-room-header.component.css',
})
export class ViewRoomHeaderComponent {
  private readonly location = inject(Location);
  private lastScrollY = 0;

  protected readonly hidden = signal(false);

  /** Cuộn xuống thì ẩn header, cuộn lên hoặc về đầu trang thì hiện lại. */
  protected onScroll(): void {
    const y = window.scrollY;
    if (y < SCROLL_TOP) {
      this.hidden.set(false);
      this.lastScrollY = y;
      return;
    }
    const delta = y - this.lastScrollY;
    if (Math.abs(delta) < SCROLL_STEP) return;
    this.hidden.set(delta > 0);
    this.lastScrollY = y;
  }

  protected back(): void {
    this.location.back();
  }
}
