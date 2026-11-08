import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const BOX = { width: 150, height: 66 };
/** Chiếu xiên kiểu "cabinet": chiều sâu vẽ chếch lên phải, rút còn một nửa. */
const DEPTH_RATIO = 0.5;
const SKEW = { x: 0.8, y: -0.6 };

/**
 * Bản vẽ kỹ thuật đơn giản của một khối: mặt trước (dài × cao) kèm chiều sâu,
 * ghi kích thước thật. Vẽ từ số liệu nên luôn khớp với biến thể đang chọn.
 */
@Component({
  selector: 'app-dimension-drawing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dimension-drawing.component.html',
  styleUrl: './dimension-drawing.component.css',
})
export class DimensionDrawingComponent {
  readonly length = input.required<number>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly unit = input('cm');
  readonly label = input('Bản vẽ kích thước');

  protected readonly shape = computed(() => {
    const length = this.length(), width = this.width(), height = this.height();
    const depth = width * DEPTH_RATIO;
    const scale = Math.min(BOX.width / (length + depth * SKEW.x), BOX.height / (height + depth * Math.abs(SKEW.y)));
    const front = { w: length * scale, h: height * scale };
    const off = { x: depth * scale * SKEW.x, y: depth * scale * SKEW.y };
    const x = 38, y = 24 - off.y;
    return { front, off, x, y };
  });
}
