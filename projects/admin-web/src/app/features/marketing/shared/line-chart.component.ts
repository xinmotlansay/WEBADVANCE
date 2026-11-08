import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

/** Biểu đồ đường SVG, màu lấy từ token. Có số nhỏ nhất/lớn nhất và mô tả cho trình đọc màn hình. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      <figcaption>
        {{ title() }} <span class="cv-muted">({{ unit() }})</span>
      </figcaption>
      @if (points().length === 0) {
        <p class="cv-muted">Chưa có dữ liệu trong khoảng thời gian đã chọn.</p>
      } @else {
        <svg
          viewBox="0 0 600 160"
          role="img"
          [attr.aria-label]="summary()"
          preserveAspectRatio="none"
        >
          <line x1="0" y1="150" x2="600" y2="150" class="axis" />
          <polyline [attr.points]="path()" class="line" />
          @for (c of dots(); track c.x) {
            <circle [attr.cx]="c.x" [attr.cy]="c.y" r="3" class="dot" />
          }
        </svg>
        <div class="legend">
          <span>{{ points()[0].label }}</span>
          <span>Cao nhất: {{ max().toLocaleString('vi-VN') }}</span>
          <span>{{ points()[points().length - 1].label }}</span>
        </div>
      }
    </figure>
  `,
  styles: `
    .chart {
      margin: 0;
    }
    figcaption {
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    svg {
      display: block;
      width: 100%;
      height: 160px;
    }
    .axis {
      stroke: var(--cv-border);
      stroke-width: 1;
    }
    .line {
      fill: none;
      stroke: var(--cv-navy);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .dot {
      fill: var(--cv-navy);
    }
    .legend {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--cv-muted);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class LineChartComponent {
  readonly title = input.required<string>();
  readonly unit = input.required<string>();
  readonly points = input.required<ChartPoint[]>();

  protected readonly max = computed(() => Math.max(0, ...this.points().map((p) => p.value)));
  protected readonly dots = computed(() => {
    const pts = this.points();
    const top = this.max() || 1;
    return pts.map((p, i) => ({
      x: pts.length === 1 ? 300 : 8 + (i / (pts.length - 1)) * 584,
      y: 150 - (p.value / top) * 135,
    }));
  });
  protected readonly path = computed(() =>
    this.dots()
      .map((d) => `${d.x},${d.y}`)
      .join(' '),
  );
  protected readonly summary = computed(
    () =>
      `${this.title()}: ${this.points().length} ngày, từ ${this.points()[0]?.label} đến ${this.points().at(-1)?.label}, cao nhất ${this.max().toLocaleString('vi-VN')} ${this.unit()}`,
  );
}
