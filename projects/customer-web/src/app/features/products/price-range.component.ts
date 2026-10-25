import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogApiService } from 'shared';
import { catchError, combineLatest, map, of } from 'rxjs';

@Component({
  selector: 'app-price-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="slider"
      [style.--start]="percent(low()) + '%'"
      [style.--end]="percent(high()) + '%'"
    >
      <div class="track"></div>
      <input
        #lower
        type="range"
        aria-label="Kéo giá thấp nhất"
        [min]="bounds().min"
        [max]="bounds().max"
        step="1"
        [value]="low()"
        (input)="move('minPrice', lower)"
      />
      <input
        #upper
        type="range"
        aria-label="Kéo giá cao nhất"
        [min]="bounds().min"
        [max]="bounds().max"
        step="1"
        [value]="high()"
        (input)="move('maxPrice', upper)"
      />
    </div>
    <div class="limits">
      <span>{{ format(bounds().min) }}</span
      ><span>{{ format(bounds().max) }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin: 24px 0 20px;
    }
    .slider {
      position: relative;
      height: 24px;
      margin-inline: 10px;
    }
    .track {
      position: absolute;
      inset: 10px 0;
      border-radius: 4px;
      background: linear-gradient(
        to right,
        #d9d9d9 0 var(--start),
        var(--color-primary) var(--start) var(--end),
        #d9d9d9 var(--end) 100%
      );
    }
    .track::before,
    .track::after {
      content: '';
      position: absolute;
      top: -7px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #d9d9d9;
    }
    .track::before {
      left: -9px;
    }
    .track::after {
      right: -9px;
    }
    input {
      position: absolute;
      inset: 0;
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      height: 24px;
      min-height: 0;
      padding: 0;
      margin: 0;
      border: 0;
      background: transparent;
      pointer-events: none;
    }
    input::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 50%;
      background: var(--color-primary);
      cursor: grab;
      pointer-events: auto;
    }
    input::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 50%;
      background: var(--color-primary);
      cursor: grab;
      pointer-events: auto;
    }
    input:focus-visible {
      outline: none;
    }
    input:focus-visible::-webkit-slider-thumb {
      outline: 3px solid #90b4d2;
      outline-offset: 3px;
    }
    input:focus-visible::-moz-range-thumb {
      outline: 3px solid #90b4d2;
      outline-offset: 3px;
    }
    input:focus {
      z-index: 2;
    }
    .limits {
      display: flex;
      justify-content: space-between;
      color: #aaa;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class PriceRangeComponent {
  readonly minPrice = input('');
  readonly maxPrice = input('');
  readonly priceChanged = output<{ key: 'minPrice' | 'maxPrice'; value: string }>();
  private readonly api = inject(CatalogApiService);
  private readonly catalogBounds = toSignal(
    combineLatest([
      this.api.getProducts({ sort: 'price_asc', limit: 1 }),
      this.api.getProducts({ sort: 'price_desc', limit: 1 }),
    ]).pipe(
      map(([low, high]) => ({
        min: low.items[0]?.priceFrom ?? 0,
        max: high.items[0]?.priceFrom ?? 0,
      })),
      catchError(() => of({ min: 0, max: 0 })),
    ),
    { initialValue: { min: 0, max: 0 } },
  );
  protected readonly bounds = computed(() => ({
    min: Math.min(
      this.catalogBounds().min,
      this.minPrice() === '' ? Infinity : Number(this.minPrice()),
    ),
    max: Math.max(
      this.catalogBounds().max,
      Number(this.maxPrice()),
      Number(this.minPrice()),
      this.catalogBounds().min + 1,
    ),
  }));
  protected readonly low = computed(() =>
    this.minPrice() === '' ? this.bounds().min : Number(this.minPrice()),
  );
  protected readonly high = computed(() =>
    this.maxPrice() === '' ? this.bounds().max : Number(this.maxPrice()),
  );
  protected percent(value: number): number {
    return Math.max(
      0,
      Math.min(100, ((value - this.bounds().min) / (this.bounds().max - this.bounds().min)) * 100),
    );
  }
  protected format(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  protected move(key: 'minPrice' | 'maxPrice', input: HTMLInputElement): void {
    const value =
      key === 'minPrice'
        ? Math.min(Number(input.value), this.high())
        : Math.max(Number(input.value), this.low());
    input.value = String(value);
    this.priceChanged.emit({ key, value: String(value) });
  }
}
