import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Popup chi tiết không chặn nền (admin-ui-rule mục 6): rộng 400px, header navy, đóng bằng ✕ hoặc Esc.
 * Mở thì đưa focus vào popup, đóng thì trả focus về phần tử đã mở nó.
 */
@Component({
  selector: 'app-detail-popup',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <section #panel class="popup" role="dialog" [attr.aria-label]="title()" tabindex="-1">
      <header class="popup-head">
        <span class="kicker">{{ kicker() }}</span>
        <h2>{{ title() }}</h2>
        <button type="button" class="close" aria-label="Đóng" (click)="closed.emit()">
          <app-icon name="x" [small]="true" />
        </button>
      </header>
      <div class="popup-body"><ng-content /></div>
      <footer class="popup-foot"><ng-content select="[popup-actions]" /></footer>
    </section>
  `,
  styles: `
    :host {
      position: absolute;
      z-index: 15;
      right: 32px;
      width: 400px;
      max-width: calc(100% - 32px);
    }
    .popup {
      display: flex;
      flex-direction: column;
      max-height: min(640px, calc(100vh - 48px));
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      box-shadow: var(--cv-shadow);
      overflow: hidden;
      animation: rise 0.16s ease-out;
    }
    .popup:focus {
      outline: none;
    }
    .popup-head {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 48px 12px 16px;
      background: var(--cv-navy);
      color: var(--cv-surface);
    }
    .kicker {
      font-size: 13px;
      color: var(--cv-on-navy);
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .kicker:empty + h2 {
      text-align: left;
    }
    .close {
      position: absolute;
      top: 8px;
      right: 8px;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius);
      background: transparent;
      color: var(--cv-surface);
      cursor: pointer;
    }
    .close:hover {
      background: var(--cv-navy-hover);
    }
    .close:focus-visible {
      outline-color: var(--cv-surface);
    }
    .popup-body {
      flex: 1;
      min-height: 150px;
      padding: 16px;
      overflow-y: auto;
      font-size: 13px;
    }
    .popup-foot {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--cv-border);
      background: var(--cv-surface-alt);
    }
    .popup-foot:empty {
      display: none;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    @media (max-width: 767px) {
      :host {
        position: fixed;
        inset: auto 8px 8px;
        width: auto;
        max-width: none;
      }
    }
  `,
})
export class DetailPopupComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly kicker = input('');
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly opener = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    this.panel().nativeElement.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
}
