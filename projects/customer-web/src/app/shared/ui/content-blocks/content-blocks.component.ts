import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ContentBlock, ContentBlockItem } from 'shared';
import { ImageTilesComponent, type TileItem } from '../../../features/home/components/image-tiles/image-tiles.component';
import { CountdownComponent } from '../countdown/countdown.component';
import { LinkDirective } from '../link/link.directive';

/**
 * Hiển thị các khối nội dung do Marketing soạn (trang chủ, landing page).
 * Server đã bỏ khối tắt và khối không còn dữ liệu, client chỉ vẽ theo thứ tự nhận được.
 */
@Component({
  selector: 'app-content-blocks',
  imports: [RouterLink, ImageTilesComponent, CountdownComponent, LinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './content-blocks.component.html',
  styleUrl: './content-blocks.component.css',
})
export class ContentBlocksComponent {
  readonly blocks = input.required<ContentBlock[]>();

  protected tiles(items: ContentBlockItem[]): TileItem[] {
    return items.map((i) => ({ id: i.id ?? '', name: i.name ?? '', image: i.imageUrl ?? '', link: i.link }));
  }
}
