import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Thanh tỷ lệ ngang (admin-ui-rule mục 6, thay gauge tròn). Số và nhãn luôn hiện bằng chữ; vượt ngưỡng thì đổi màu xấu kèm chữ cảnh báo. */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="m" role="group" [attr.aria-label]="label() + ': ' + text()">
      <div class="m__head">
        <span>{{ label() }}</span>
        <strong class="cv-num">{{ text() }}</strong>
      </div>
      <div class="cv-bar" aria-hidden="true">
        <span [class.bad]="bad()" [style.width.%]="width()"></span>
        <i class="mark" [style.left.%]="warnAt() * 100"></i>
      </div>
      <span class="m__note" [class.warn]="bad()">
        {{ bad() ? 'Cao hơn mức nên có' : 'Mức nên có dưới ' + (warnAt() * 100) + '%' }}
      </span>
    </div>
  `,
  styles: `
    .m__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--cv-muted);
    }
    strong {
      font-size: 22px;
      font-weight: 600;
      color: var(--cv-navy);
    }
    .cv-bar {
      position: relative;
      overflow: visible;
    }
    .cv-bar > span {
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .cv-bar > span.bad {
      background: var(--cv-down);
    }
    .mark {
      position: absolute;
      top: -4px;
      bottom: -4px;
      width: 1px;
      background: var(--cv-muted);
    }
    .m__note {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: var(--cv-muted);
    }
    .m__note.warn {
      color: var(--cv-down);
      font-weight: 600;
    }
  `,
})
export class MeterComponent {
  readonly label = input.required<string>();
  /** Tỷ lệ 0..1; null là chưa có số liệu. */
  readonly value = input.required<number | null>();
  readonly text = input.required<string>();
  /** Từ ngưỡng này trở lên coi là cao bất thường. */
  readonly warnAt = input(0.3);

  protected readonly bad = computed(() => (this.value() ?? 0) >= this.warnAt());
  protected readonly width = computed(() => Math.min(1, Math.max(0, this.value() ?? 0)) * 100);
}

/** Đường xu hướng nhỏ cho thẻ KPI; chỉ trang trí, giá trị thật nằm ở số bên cạnh. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (path()) {
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        @for (m of markLines(); track m.cls) {
          <line [attr.x1]="m.x" [attr.x2]="m.x" y1="0" y2="28" [class]="m.cls" />
        }
        <polyline [attr.points]="path()" />
      </svg>
    }
  `,
  styles: `
    svg {
      display: block;
      width: 100%;
      height: 28px;
      margin-top: 6px;
    }
    polyline {
      fill: none;
      stroke: var(--cv-navy);
      stroke-width: 1.6;
      vector-effect: non-scaling-stroke;
      stroke-linejoin: round;
    }
    line {
      stroke-width: 1.4;
      vector-effect: non-scaling-stroke;
    }
    .current {
      stroke: var(--cv-muted);
      stroke-dasharray: 3 2;
    }
    .best {
      stroke: var(--cv-up);
    }
  `,
})
export class SparklineComponent {
  readonly values = input.required<number[]>();
  /** Vạch dọc tùy chọn tại chỉ số điểm: mức đang chọn (nét đứt) và mức tốt nhất. */
  readonly current = input<number | null>(null);
  readonly best = input<number | null>(null);

  protected readonly markLines = computed(() => {
    const n = this.values().length;
    const x = (i: number | null) => (i === null || i < 0 || n < 2 ? null : (i / (n - 1)) * 100);
    return [
      { cls: 'best', x: x(this.best()) },
      { cls: 'current', x: x(this.current()) },
    ].filter((m) => m.x !== null);
  });

  protected readonly path = computed(() => {
    const v = this.values();
    if (v.length < 3) return ''; // 2 điểm chỉ là một đoạn thẳng, không nói lên xu hướng
    const max = Math.max(...v);
    const min = Math.min(...v);
    const span = max - min || 1;
    return v.map((n, i) => `${(i / (v.length - 1)) * 100},${26 - ((n - min) / span) * 24}`).join(' ');
  });
}
