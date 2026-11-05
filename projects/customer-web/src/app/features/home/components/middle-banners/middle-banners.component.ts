import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import type { Banner } from 'shared';
import { BannerTrackerService } from '../../../../core/marketing/banner-tracker.service';
import { LinkDirective } from '../../../../shared/ui/link/link.directive';

/** Banner giữa trang chủ (tối đa 3): lưới ảnh có liên kết. */
@Component({
  selector: 'app-middle-banners',
  imports: [LinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="mid" [style.--cols]="banners().length">
      @for (banner of banners(); track banner.id) {
        <li>
          <a
            class="mid__item"
            [cvLink]="banner.linkUrl"
            [newTab]="banner.openInNewTab"
            [attr.aria-label]="banner.title || null"
            (click)="tracker.click(banner.id)"
          >
            <picture>
              @if (banner.mobileImageUrl) {
                <source media="(max-width: 767px)" [srcset]="banner.mobileImageUrl" />
              }
              <img [src]="banner.imageUrl" [alt]="banner.title" loading="lazy" />
            </picture>
            @if (banner.ctaLabel) {
              <span class="mid__cta">{{ banner.ctaLabel }}</span>
            }
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    .mid {
      display: grid;
      gap: var(--grid-gutter);
      margin-block: var(--space-2xl);
      padding: 0;
      list-style: none;
    }
    .mid__item {
      position: relative;
      display: block;
      overflow: hidden;
      border-radius: var(--radius);
    }
    /* Tỉ lệ theo quy định upload: 1200×400 desktop, 750×400 mobile. */
    .mid__item img {
      display: block;
      width: 100%;
      aspect-ratio: 15 / 8;
      object-fit: cover;
    }
    .mid__cta {
      position: absolute;
      left: var(--space-md);
      bottom: var(--space-md);
      padding: var(--space-xs) var(--space-md);
      background: var(--color-white);
      border-radius: var(--radius);
      font-weight: var(--font-weight-medium);
    }
    @media (min-width: 768px) {
      .mid {
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
      }
      .mid__item img {
        aspect-ratio: 3 / 1;
      }
    }
  `,
})
export class MiddleBannersComponent {
  readonly banners = input.required<Banner[]>();
  protected readonly tracker = inject(BannerTrackerService);

  constructor() {
    // Cả lưới hiện cùng lúc nên ghi lượt hiển thị cho mọi banner.
    effect(() => this.banners().forEach((b) => this.tracker.impression(b.id)));
  }
}
