import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { CollectionImage, Hotspot } from '../../../services/marketing/collection.service';
import { PromotionApi, type ProductOption } from '../../../services/marketing/promotion.service';
import { nudge, toRelative, type Point } from './hotspot-math';

export const MAX_HOTSPOTS = 8;

/**
 * Đặt điểm sản phẩm lên ảnh: bấm vào ảnh để thêm, kéo để dời, chọn sản phẩm cho điểm đang chọn.
 * Bàn phím: Tab tới điểm, mũi tên dời 1%, Delete/Backspace xóa.
 */
@Component({
  selector: 'app-hotspot-editor',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stage" #stage (click)="add($event)">
      <img #pic [src]="image().url" alt="" draggable="false" (load)="natural.set(pic.naturalWidth / pic.naturalHeight)" />
      @if (guide(); as g) {
        <div class="guide" aria-hidden="true" [style.left.%]="g.left" [style.top.%]="g.top" [style.width.%]="g.width" [style.height.%]="g.height"></div>
      }
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
          (click)="$event.stopPropagation(); selectDot(i)"
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
        @if (h.productId) {
          <div class="pick__current">
            <strong>{{ nameOf(h.productId) || h.productId }}</strong>
            <button type="button" class="cv-btn" (click)="setProduct('')">Đổi sản phẩm</button>
          </div>
        }
        <input
          class="cv-input"
          type="search"
          autocomplete="off"
          [id]="selectId()"
          [placeholder]="h.productId ? 'Tìm sản phẩm khác theo tên hoặc mã' : 'Nhập tên hoặc mã sản phẩm để tìm'"
          [ngModel]="term()"
          (ngModelChange)="search($event)"
        />
        @if (results().length) {
          <ul class="results" role="listbox" aria-label="Kết quả tìm sản phẩm">
            @for (p of results(); track p.id) {
              <li>
                <button type="button" class="result" [class.result--on]="p.id === h.productId" (click)="choose(p)">
                  <span>{{ p.name }}</span>
                  <span class="cv-muted">{{ p.id === h.productId ? 'Đang chọn' : 'Chọn' }}</span>
                </button>
              </li>
            }
          </ul>
        } @else if (term().trim().length >= 2 && searched()) {
          <p class="cv-hint">Không tìm thấy sản phẩm đang kinh doanh phù hợp.</p>
        } @else if (!term().trim()) {
          <p class="cv-hint">Gõ ít nhất 2 ký tự. Sản phẩm chọn ở đây sẽ tự được thêm vào collection khi lưu.</p>
        }
        <button type="button" class="cv-btn cv-btn--danger pick__del" (click)="remove(selected()!)">Xóa điểm</button>
      </div>
    }
  `,
  styles: `
    .stage {
      position: relative;
      max-width: 720px;
      cursor: crosshair;
      user-select: none;
      overflow: hidden;
      border-radius: var(--cv-radius);
    }
    .stage img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: var(--cv-radius);
    }
    .guide {
      position: absolute;
      border: 2px dashed #fff;
      box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
      pointer-events: none;
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
      display: grid;
      gap: 8px;
      max-width: 720px;
      margin-top: 8px;
    }
    .pick label {
      font-weight: 600;
      font-size: 14px;
    }
    .pick__current {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius);
      background: var(--cv-surface-alt);
    }
    .pick__del {
      justify-self: start;
    }
    .results {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--cv-border);
      border-radius: var(--cv-radius);
      overflow: hidden;
    }
    .result {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border: 0;
      border-bottom: 1px solid var(--cv-border);
      background: none;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .results li:last-child .result {
      border-bottom: 0;
    }
    .result:hover,
    .result--on {
      background: var(--cv-surface-alt);
    }
  `,
})
export class HotspotEditorComponent {
  readonly image = model.required<CollectionImage>();
  private readonly api = inject(PromotionApi);
  readonly products = input<{ id: string; name: string }[]>([]);
  readonly inputId = input('hs');
  /** Tỉ lệ khung khách thấy (rộng/cao). Phần ngoài khung bị cắt nên được làm mờ. */
  readonly cropRatio = input<number | null>(null);
  protected readonly natural = signal<number | null>(null);

  protected readonly max = MAX_HOTSPOTS;
  protected readonly selected = signal<number | null>(null);
  protected dragging = false;
  protected readonly term = signal('');
  protected readonly results = signal<ProductOption[]>([]);
  protected readonly searched = signal(false);
  /** Tên các sản phẩm đã chọn trong phiên này (ngoài danh sách collection). */
  private readonly picked = signal(new Map<string, string>());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  /** Vùng khách nhìn thấy (ảnh được cắt giữa theo tỉ lệ khung), tính theo % của ảnh gốc. */
  protected guide(): { left: number; top: number; width: number; height: number } | null {
    const crop = this.cropRatio();
    const nat = this.natural();
    if (!crop || !nat) return null;
    if (nat > crop) {
      const width = (crop / nat) * 100;
      return { left: (100 - width) / 2, top: 0, width, height: 100 };
    }
    const height = (nat / crop) * 100;
    return { left: 0, top: (100 - height) / 2, width: 100, height };
  }

  protected selectDot(i: number): void {
    this.selected.set(i);
    this.term.set('');
    this.results.set([]);
  }

  protected selectId(): string {
    return this.inputId() + '-product';
  }

  protected nameOf(id: string): string {
    return this.picked().get(id) ?? this.products().find((p) => p.id === id)?.name ?? '';
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

  protected search(value: string): void {
    this.term.set(value);
    clearTimeout(this.timer);
    if (value.trim().length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        this.results.set((await firstValueFrom(this.api.products({ q: value.trim() }))).slice(0, 8));
      } catch {
        this.results.set([]);
      }
      this.searched.set(true);
    }, 300);
  }

  protected choose(p: ProductOption): void {
    this.picked.update((m) => new Map(m).set(p.id, p.name));
    this.setProduct(p.id);
    this.term.set('');
    this.results.set([]);
    this.searched.set(false);
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
