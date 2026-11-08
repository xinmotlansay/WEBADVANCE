import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { Banner } from 'shared';
import { shouldShowPopup } from '../../../../core/marketing/banner-rules';
import { BannerTrackerService } from '../../../../services/ui/banner-tracker.service';
import { readLocal, writeLocal } from '../../../../core/storage/local-store';
import { LinkDirective } from '../../../../shared/ui/link/link.directive';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

const sessionKey = (id: string) => `cv.popupShown.${id}`;
const localKey = (id: string) => `cv.popupLastShown.${id}`;

function shownThisSession(id: string): boolean {
  try {
    return sessionStorage.getItem(sessionKey(id)) === '1';
  } catch {
    return false;
  }
}

/** Banner popup trang chủ (tối đa 1), hiện theo tần suất admin chọn. `<dialog>` gốc lo focus và phím Esc. */
@Component({
  selector: 'app-popup-banner',
  imports: [LinkDirective, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (banner(); as b) {
      <dialog #dialog class="popup" [attr.aria-label]="b.title || 'Ưu đãi'" (click)="onBackdrop($event)">
        <button type="button" class="popup__close" aria-label="Đóng" (click)="dialog.close()">
          <app-icon name="lucide:x" [size]="20" />
        </button>
        <a [cvLink]="b.linkUrl" [newTab]="b.openInNewTab" (click)="tracker.click(b.id); dialog.close()">
          <picture>
            @if (b.mobileImageUrl) {
              <source media="(max-width: 767px)" [srcset]="b.mobileImageUrl" />
            }
            <img [src]="b.imageUrl" [alt]="b.title" />
          </picture>
        </a>
      </dialog>
    }
  `,
  styles: `
    .popup {
      max-width: min(560px, calc(100vw - 32px));
      padding: 0;
      border: 0;
      border-radius: var(--radius-panel);
      overflow: hidden;
    }
    .popup::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
    .popup img {
      display: block;
      width: 100%;
      max-height: 80vh;
      aspect-ratio: 1;
      object-fit: cover;
    }
    .popup__close {
      position: absolute;
      top: var(--space-sm);
      right: var(--space-sm);
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--color-white);
      cursor: pointer;
    }
  `,
})
export class PopupBannerComponent {
  readonly banners = input.required<Banner[]>();
  protected readonly tracker = inject(BannerTrackerService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly banner = computed(() => {
    const b = this.banners()[0];
    if (!b) return null;
    const last = readLocal<number | null>(localKey(b.id), null);
    return shouldShowPopup(b.popupFrequency, last, shownThisSession(b.id)) ? b : null;
  });

  constructor() {
    effect(() => {
      const b = this.banner();
      const el = this.dialog()?.nativeElement;
      if (!b || !el || el.open) return;
      el.showModal();
      writeLocal(localKey(b.id), Date.now());
      try {
        sessionStorage.setItem(sessionKey(b.id), '1');
      } catch {
        // Không lưu được thì popup có thể hiện lại ở lần tải sau, chấp nhận được.
      }
      this.tracker.impression(b.id);
    });
  }

  /** Nhấp ra nền tối bên ngoài ảnh thì đóng. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.dialog()?.nativeElement.close();
  }
}
