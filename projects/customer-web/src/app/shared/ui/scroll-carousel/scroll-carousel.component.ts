import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { IconComponent } from '../icons/icon.component';

/**
 * Băng chuyền cuộn ngang: nội dung truyền vào là các phần tử con, mỗi phần tử chiếm
 * `1 / perView` bề rộng, khoảng cách theo gutter của lưới. Mũi tên cuộn theo một trang.
 */
@Component({
  selector: 'app-scroll-carousel',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scroll-carousel.component.html',
  styleUrl: './scroll-carousel.component.css',
  host: {
    '[style.--per-view]': 'perView()',
    '[style.--per-view-tablet]': 'perViewTablet()',
    '[style.--per-view-mobile]': 'perViewMobile()',
  },
})
export class ScrollCarouselComponent {
  readonly perView = input(4);
  readonly perViewTablet = input(3);
  readonly perViewMobile = input(2);
  readonly arrowTone = input<'dark' | 'light'>('dark');
  readonly label = input('Danh sách cuộn ngang');

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  scroll(direction: -1 | 1): void {
    const el = this.track().nativeElement;
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' });
  }
}
