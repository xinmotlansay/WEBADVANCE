import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-detail-popup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <section
        #panel
        class="cv-popup"
        role="dialog"
        aria-modal="false"
        [attr.aria-label]="title()"
        tabindex="-1"
        (keydown.escape)="closed.emit()"
      >
        <header class="cv-popup__header">
          <span class="cv-popup__title">{{ title() }}</span>
          <button
            type="button"
            class="cv-icon-btn cv-icon-btn--on-navy"
            aria-label="Đóng"
            (click)="closed.emit()"
          >
            <app-icon name="x" size="sm" />
          </button>
        </header>
        <div class="cv-popup__body">
          <ng-content select="[popupBody]" />
        </div>
        <footer class="cv-popup__footer">
          <ng-content select="[popupFooter]" />
        </footer>
      </section>
    }
  `,
})
export class DetailPopupComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private lastFocused: HTMLElement | null = null;

  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  constructor() {
    effect(() => {
      if (this.open()) {
        this.lastFocused = document.activeElement as HTMLElement | null;
        queueMicrotask(() => this.panel()?.nativeElement.focus());
      } else {
        this.lastFocused?.focus?.();
      }
    });
  }

  protected focusHost(): void {
    (this.host.nativeElement as HTMLElement).focus();
  }
}
