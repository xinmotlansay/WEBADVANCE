import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { Banner } from 'shared';
import { LinkDirective } from '../../../../shared/ui/link/link.directive';
import { BannerTrackerService } from '../../../../services/ui/banner-tracker.service';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

const AUTOPLAY_MS = 6000;

@Component({
  selector: 'app-hero-banner',
  imports: [LinkDirective, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-banner.component.html',
  styleUrl: './hero-banner.component.css',
})
export class HeroBannerComponent {
  readonly banners = input.required<Banner[]>();

  protected readonly index = signal(0);
  protected readonly current = computed(() => this.banners()[this.index()]);

  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly tracker = inject(BannerTrackerService);

  constructor() {
    // Ghi lượt hiển thị cho banner đang được xem (mỗi banner 1 lượt/phiên).
    effect(() => {
      const banner = this.current();
      if (banner) this.tracker.impression(banner.id);
    });
    this.startAutoplay();
    inject(DestroyRef).onDestroy(() => this.stopAutoplay());
  }

  protected go(step: -1 | 1): void {
    const total = this.banners().length;
    if (total === 0) return;
    this.index.update((i) => (i + step + total) % total);
    this.startAutoplay();
  }

  protected select(position: number): void {
    this.index.set(position);
    this.startAutoplay();
  }

  protected startAutoplay(): void {
    this.stopAutoplay();
    this.timer = setInterval(() => {
      const total = this.banners().length;
      if (total > 1) this.index.update((i) => (i + 1) % total);
    }, AUTOPLAY_MS);
  }

  protected stopAutoplay(): void {
    clearInterval(this.timer);
  }
}
