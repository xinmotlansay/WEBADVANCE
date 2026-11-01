import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ICON_PATHS } from './icon-paths';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="cv-icon" [class]="'cv-icon cv-icon--' + size()" [innerHTML]="html()"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        flex-shrink: 0;
        line-height: 0;
      }
      .cv-icon {
        display: inline-flex;
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
        color: currentColor;
      }
      .cv-icon ::ng-deep svg {
        width: 100%;
        height: 100%;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .cv-icon--sm {
        width: 16px;
        height: 16px;
      }
      .cv-icon--lg {
        width: 24px;
        height: 24px;
      }
    `,
  ],
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  readonly html = computed<SafeHtml>(() => {
    const inner = ICON_PATHS[this.name()] ?? ICON_PATHS['inbox'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
