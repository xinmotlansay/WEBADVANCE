import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  CatalogApiService,
  type Banner,
  type Category,
  type CollectionSummary,
  type FlashSale,
  type InspirationSummary,
  type ProductListItem,
  type Showroom,
} from 'shared';
import { Observable, catchError, filter, map, of, switchMap } from 'rxjs';
import { CollectionSliderComponent } from './components/collection-slider/collection-slider.component';
import { FlashSaleComponent } from './components/flash-sale/flash-sale.component';
import { HeroBannerComponent } from './components/hero-banner/hero-banner.component';
import { ImageTilesComponent, type TileItem } from './components/image-tiles/image-tiles.component';
import { InspirationGalleryComponent } from './components/inspiration-gallery/inspiration-gallery.component';
import { ShowroomNetworkComponent } from './components/showroom-network/showroom-network.component';
import { ProductSectionComponent } from './components/product-section/product-section.component';
import { ViewRoomCtaComponent } from './components/view-room-cta/view-room-cta.component';

const COMPLETE_ROOM_SLUG = 'phong-khach';

@Component({
  selector: 'app-home',
  imports: [
    HeroBannerComponent,
    ProductSectionComponent,
    ImageTilesComponent,
    CollectionSliderComponent,
    FlashSaleComponent,
    InspirationGalleryComponent,
    ViewRoomCtaComponent,
    ShowroomNetworkComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly api = inject(CatalogApiService);

  /** Mỗi khối tự tải dữ liệu; một khối lỗi thì chỉ khối đó bị ẩn, không làm hỏng cả trang. */
  private load<T>(source: Observable<T>, fallback: T): () => T {
    return toSignal(source.pipe(catchError(() => of(fallback))), { initialValue: fallback });
  }

  protected readonly banners = this.load<Banner[]>(this.api.getBanners(), []);
  protected readonly collections = this.load<CollectionSummary[]>(this.api.getCollections(), []);
  protected readonly inspirations = this.load<InspirationSummary[]>(this.api.getInspirations(), []);
  protected readonly showrooms = this.load<Showroom[]>(this.api.getShowrooms(), []);
  protected readonly flashSale = this.load<FlashSale | null>(this.api.getFlashSale(), null);

  protected readonly newProducts = this.load<ProductListItem[]>(
    this.api.getProducts({ badge: 'NEW', sort: 'newest', limit: 8 }).pipe(map((r) => r.items)),
    [],
  );
  protected readonly recommended = this.load<ProductListItem[]>(
    this.api.getProducts({ badge: 'BEST_SELLER', limit: 4 }).pipe(map((r) => r.items)),
    [],
  );

  private readonly productCategories = this.load<Category[]>(
    this.api.getCategories('PRODUCT_CATEGORY'),
    [],
  );
  private readonly rooms = this.load<Category[]>(this.api.getCategories('ROOM'), []);

  protected readonly categoryTiles = computed<TileItem[]>(() =>
    this.toTiles(this.productCategories()),
  );
  protected readonly roomTiles = computed<TileItem[]>(() => this.toTiles(this.rooms()));

  private readonly completeRoom = computed(
    () => this.rooms().find((room) => room.slug === COMPLETE_ROOM_SLUG) ?? this.rooms()[0],
  );

  protected readonly completeRoomProducts = this.load<ProductListItem[]>(
    toObservable(this.completeRoom).pipe(
      filter((room): room is Category => !!room),
      switchMap((room) => this.api.getProducts({ categoryIds: [room.id], limit: 4 })),
      map((r) => r.items),
    ),
    [],
  );

  private toTiles(categories: Category[]): TileItem[] {
    return categories.map((c) => ({ id: c.id, name: c.name, image: c.image }));
  }
}
