import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ShortVndPipe, VndPipe } from '../../../core/format/format.pipes';

@Component({
  selector: 'app-ratio-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cv-ratio-row">
      <span>{{ label() }}</span>
      <span class="cv-num">{{ value() }}@if (suffix()) {{{ suffix() }}}</span>
    </div>
    <div class="cv-ratio">
      <div class="cv-ratio__fill" [style.width.%]="percent()"></div>
    </div>
  `,
})
export class RatioBarComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly suffix = input('');
  readonly percent = computed(() => {
    const max = this.max();
    return max > 0 ? Math.min(100, Math.round((this.value() / max) * 100)) : 0;
  });
}

@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShortVndPipe],
  template: `
    <div class="cv-spread" style="margin-bottom: 4px">
      <span class="cv-label">{{ label() }}</span>
      <span class="cv-small cv-muted">{{ unit() }}</span>
    </div>
    <div class="cv-chart">
      @for (item of data(); track item.label) {
        <div class="cv-chart__col">
          <div
            class="cv-chart__bar"
            [class.cv-chart__bar--current]="item.current"
            [style.height.%]="height(item.value)"
          >
            <span class="cv-chart__value">{{ item.value | shortVnd }}</span>
          </div>
          <span class="cv-chart__x">{{ item.label }}</span>
        </div>
      }
    </div>
  `,
})
export class BarChartComponent {
  readonly label = input('');
  readonly unit = input('triệu đồng');
  readonly data = input.required<Array<{ label: string; value: number; current?: boolean }>>();

  private readonly max = computed(() => Math.max(1, ...this.data().map((item) => item.value)));

  height(value: number): number {
    return Math.max(2, Math.round((value / this.max()) * 100));
  }
}

@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VndPipe],
  template: `
    <div class="cv-bars">
      @for (item of items(); track item.name; let index = $index) {
        <div class="cv-bars__row">
          <span class="cv-nowrap" style="overflow: hidden; text-overflow: ellipsis">{{ item.name }}</span>
          <div class="cv-bars__track">
            <div
              class="cv-bars__fill"
              [class.cv-bars__fill--lead]="index === 0"
              [style.width.%]="width(item.value)"
            ></div>
          </div>
          <span class="cv-bars__value">{{ item.value | vnd }}</span>
        </div>
      }
    </div>
  `,
})
export class BarListComponent {
  readonly items = input.required<Array<{ name: string; value: number }>>();

  private readonly max = computed(() => Math.max(1, ...this.items().map((item) => item.value)));

  width(value: number): number {
    return Math.max(2, Math.round((value / this.max()) * 100));
  }
}
