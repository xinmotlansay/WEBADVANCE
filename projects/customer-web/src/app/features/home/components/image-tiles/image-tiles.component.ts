import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface TileItem {
  id: string;
  name: string;
  image: string;
}

/** Lưới ảnh kèm nhãn, dùng cho Danh mục sản phẩm (`category`) và Cho căn phòng của bạn (`room`). */
@Component({
  selector: 'app-image-tiles',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-tiles.component.html',
  styleUrl: './image-tiles.component.css',
  host: { '[attr.data-variant]': 'variant()' },
})
export class ImageTilesComponent {
  readonly title = input.required<string>();
  readonly items = input.required<TileItem[]>();
  readonly variant = input<'category' | 'room'>('category');
}
