import { ChangeDetectionStrategy, Component, model, input, signal } from '@angular/core';
import type { ImageFocus } from 'shared';

/**
 * Khung cắt ảnh ngang: khung có tỉ lệ cố định, kéo ảnh để chọn vùng hiển thị.
 * Kết quả là tâm cắt (x, y theo %) dùng làm `object-position` ở trang khách.
 * Bấm đúp để về giữa; bàn phím: mũi tên dời 2%.
 */
@Component({
  selector: 'app-focus-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="frame"
      role="group"
      tabindex="0"
      [attr.aria-label]="'Vùng hiển thị ảnh' + (alt() ? ': ' + alt() : '')"
      [style.aspect-ratio]="ratio() + ' / 1'"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up()"
      (pointercancel)="up()"
      (dblclick)="reset()"
      (keydown)="key($event)"
    >
      <img [src]="src()" [alt]="alt()" draggable="false" [style.object-position]="position()" (load)="loaded($event)" />
    </div>
    <p class="hint">Kéo ảnh để chọn phần hiển thị trong khung. Bấm đúp để về giữa.</p>
  `,
  styles: `
    :host { display: block; }
    .frame {
      position: relative;
      width: 100%;
      overflow: hidden;
      border-radius: 8px;
      background: #eee;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .frame:active { cursor: grabbing; }
    .frame:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .frame img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }
    .hint { margin: 6px 0 0; font-size: 12px; color: var(--cv-muted, #666); }
  `,
})
export class FocusPickerComponent {
  readonly src = input.required<string>();
  /** Tỉ lệ khung (rộng / cao), ví dụ 1.92 cho 1920 × 1000. */
  readonly ratio = input.required<number>();
  readonly alt = input('');
  /** Null = căn giữa. */
  readonly focus = model<ImageFocus | null>(null);

  private readonly natural = signal<{ w: number; h: number } | null>(null);
  private start: { px: number; py: number; x: number; y: number } | null = null;

  protected position(): string {
    const f = this.focus();
    return f ? `${f.x}% ${f.y}%` : '50% 50%';
  }

  protected loaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.natural.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  protected down(e: PointerEvent): void {
    const f = this.focus() ?? { x: 50, y: 50 };
    this.start = { px: e.clientX, py: e.clientY, x: f.x, y: f.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  protected move(e: PointerEvent): void {
    const n = this.natural();
    const frame = e.currentTarget as HTMLElement;
    if (!this.start || !n || !n.h) return;
    const rect = frame.getBoundingClientRect();
    const dx = e.clientX - this.start.px;
    const dy = e.clientY - this.start.py;
    const imgRatio = n.w / n.h;
    // object-fit: cover — phần thừa theo chiều ngang hoặc dọc quyết định vùng có thể kéo.
    if (imgRatio > rect.width / rect.height) {
      const overflow = rect.height * imgRatio - rect.width;
      if (overflow > 0) this.set(this.clamp(this.start.x - (dx * 100) / overflow), this.start.y);
    } else {
      const overflow = rect.width / imgRatio - rect.height;
      if (overflow > 0) this.set(this.start.x, this.clamp(this.start.y - (dy * 100) / overflow));
    }
  }

  protected up(): void {
    this.start = null;
  }

  protected reset(): void {
    this.focus.set(null);
  }

  protected key(e: KeyboardEvent): void {
    const step = 2;
    const f = this.focus() ?? { x: 50, y: 50 };
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = moves[e.key];
    if (!delta) return;
    e.preventDefault();
    this.set(this.clamp(f.x + delta[0]), this.clamp(f.y + delta[1]));
  }

  private set(x: number, y: number): void {
    this.focus.set({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  private clamp(v: number): number {
    return Math.min(100, Math.max(0, v));
  }
}
