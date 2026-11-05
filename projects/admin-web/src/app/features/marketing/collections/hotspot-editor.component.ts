import { ChangeDetectionStrategy, Component, ElementRef, input, model, signal, viewChild } from '@angular/core';
import type { CollectionImage, Hotspot } from './collection.api';
import { nudge, toRelative, type Point } from './hotspot-math';

export const MAX_HOTSPOTS = 8;

/**
 * Đặt điểm sản phẩm lên ảnh: bấm vào ảnh để thêm, kéo để dời, chọn sản phẩm cho điểm đang chọn.
 * Bàn phím: Tab tới điểm, mũi tên dời 1%, Delete/Backspace xóa.
 */
@Component({
  selector: 'app-hotspot-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stage" #stage (click)="add($event)">
      <img [src]="image().url" alt="" draggable="false" />
      @for (h of image().hotspots; track $index; let i = $index) {
        <button
          type="button"
          class="dot"
          [class.dot--on]="selected() === i"
          [class.dot--empty]="!h.productId"
          [style.left.%]="h.x * 100"
          [style.top.%]="h.y * 100"
          [attr.aria-label]="'Điểm ' + (i + 1) + ': ' + (nameOf(h.productId) || 'chưa chọn sản phẩm')"
          [attr.aria-pressed]="selected() === i"
          (click)="$event.stopPropagation(); selected.set(i)"
          (pointerdown)="startDrag($event, i)"
          (pointermove)="drag($event, i)"
          (pointerup)="dragging = false"
          (keydown)="key($event, i)"
        >
          {{ i + 1 }}
        </button>
      }
    </div>
    <p class="cv-hint">
      @if (image().hotspots.length >= max) {
        Đã đủ {{ max }} điểm cho ảnh này.
      } @else {
        Bấm lên ảnh để thêm điểm ({{ image().hotspots.length }}/{{ max }}). Kéo điểm để dời; chọn điểm rồi nhấn Delete để xóa.
      }
    </p>

    @if (selected() !== null && image().hotspots[selected()!]; as h) {
      <div class="pick">
        <label [for]="selectId()">Sản phẩm cho điểm {{ selected()! + 1 }}</label>
        <select class="cv-input" [id]="selectId()" [value]="h.productId" (change)="setProduct($any($event.target).value)">
          <option value="">— Chọn sản phẩm —</option>
          @for (p of products(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
        <button type="button" class="cv-btn" (click)="remove(selected()!)">Xóa điểm</button>
      </div>
      @if (!products().length) {
        <p class="cv-hint">Thêm sản phẩm vào collection ở ô "Sản phẩm thuộc collection" trước.</p>
      }
    }
  `,
  styles: `
    .stage {
      position: relative;
      max-width: 720px;
      cursor: crosshair;
      user-select: none;
    }
    .stage img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: var(--cv-radius);
    }
    .dot {
      position: absolute;
      width: 28px;
      height: 28px;
      margin: -14px 0 0 -14px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: var(--cv-navy);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: grab;
      touch-action: none;
      box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
    }
    .dot--empty {
      background: var(--cv-muted);
    }
    .dot--on {
      outline: 3px solid var(--cv-accent, #f5b301);
      outline-offset: 1px;
    }
    .pick {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .pick select {
      flex: 1 1 240px;
    }
  `,
})
export class HotspotEditorComponent {
  readonly image = model.required<CollectionImage>();
  readonly products = input<{ id: string; name: string }[]>([]);
  readonly inputId = input('hs');

  protected readonly max = MAX_HOTSPOTS;
  protected readonly selected = signal<number | null>(null);
  protected dragging = false;
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected selectId(): string {
    return this.inputId() + '-product';
  }

  protected nameOf(id: string): string {
    return this.products().find((p) => p.id === id)?.name ?? '';
  }

  private setHotspots(fn: (list: Hotspot[]) => Hotspot[]): void {
    this.image.update((img) => ({ ...img, hotspots: fn(img.hotspots) }));
  }

  private move(i: number, p: Point): void {
    this.setHotspots((list) => list.map((h, n) => (n === i ? { ...h, ...p } : h)));
  }

  protected add(e: MouseEvent): void {
    if (this.image().hotspots.length >= MAX_HOTSPOTS) return;
    const p = toRelative(e.clientX, e.clientY, this.stage().nativeElement.getBoundingClientRect());
    this.setHotspots((list) => [...list, { productId: '', ...p }]);
    this.selected.set(this.image().hotspots.length - 1);
  }

  protected startDrag(e: PointerEvent, i: number): void {
    this.dragging = true;
    this.selected.set(i);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  protected drag(e: PointerEvent, i: number): void {
    if (this.dragging) this.move(i, toRelative(e.clientX, e.clientY, this.stage().nativeElement.getBoundingClientRect()));
  }

  protected key(e: KeyboardEvent, i: number): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.remove(i);
      return;
    }
    const h = this.image().hotspots[i];
    const p = h && nudge(h, e.key);
    if (p) {
      e.preventDefault();
      this.move(i, p);
    }
  }

  protected setProduct(productId: string): void {
    const i = this.selected();
    if (i !== null) this.setHotspots((list) => list.map((h, n) => (n === i ? { ...h, productId } : h)));
  }

  protected remove(i: number): void {
    this.setHotspots((list) => list.filter((_, n) => n !== i));
    this.selected.set(null);
  }
}
