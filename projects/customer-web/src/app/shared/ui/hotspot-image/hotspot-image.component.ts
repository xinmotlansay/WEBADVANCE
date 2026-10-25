import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogApiService, CollectionImage, ProductDetail, ProductListItem } from 'shared';
import { Subscription } from 'rxjs';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';
import { CartService } from '../../../core/shopping/cart.service';
import { CollectionWishlistService } from '../../../core/shopping/collection-wishlist.service';
import { apiErrorMessage } from '../../../core/api-error';

@Component({
  selector: 'app-hotspot-image',
  imports: [RouterLink, VndPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hotspot-image.component.html',
  styleUrl: './hotspot-image.component.css',
  host: { '(document:click)': 'outside($event)' },
})
export class HotspotImageComponent {
  readonly image = input.required<CollectionImage>();
  readonly active = model<string | null>(null);
  protected readonly wishlist = inject(CollectionWishlistService);
  private readonly cart = inject(CartService);
  private readonly api = inject(CatalogApiService);
  private readonly router = inject(Router);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  protected readonly detail = signal<ProductDetail | null>(null);
  protected readonly variantId = signal('');
  protected readonly quantity = signal(1);
  protected readonly loading = signal(false);
  protected readonly choosing = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  readonly imageHeight = model(0);
  private readonly sceneImage = viewChild<ElementRef<HTMLImageElement>>('sceneImage');
  constructor() {
    effect((onCleanup) => {
      const image = this.sceneImage()?.nativeElement;
      if (!image) return;
      const observer = new ResizeObserver(() => this.imageHeight.set(image.getBoundingClientRect().height));
      observer.observe(image);
      onCleanup(() => observer.disconnect());
    });
    effect(() => {
      this.image(); this.active();
      this.request?.unsubscribe();
      this.detail.set(null); this.choosing.set(false); this.loading.set(false);
      this.error.set(''); this.message.set(''); this.quantity.set(1);
    });
  }
  protected outside(event: Event): void {
    if (!event.composedPath().includes(this.element.nativeElement)) this.active.set(null);
  }
  protected close(point: HTMLButtonElement): void {
    this.active.set(null); point.focus({ preventScroll: true });
  }
  protected choose(product: ProductListItem): void {
    if (this.loading()) return;
    this.choosing.set(true); this.error.set(''); this.message.set('');
    if (this.detail()?.id === product.id) return;
    this.loading.set(true);
    this.request = this.api.getProduct(product.slug).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.variantId.set(detail.variants.find((v) => v.stockStatus !== 'OUT_OF_STOCK')?.id ?? '');
        this.loading.set(false);
      },
      error: (error: unknown) => { this.error.set(apiErrorMessage(error)); this.loading.set(false); },
    });
  }
  protected selectedVariant() { return this.detail()?.variants.find((variant) => variant.id === this.variantId()); }
  protected add(buyNow = false): void {
    const product = this.detail(), variant = this.selectedVariant(), quantity = this.quantity();
    if (!product || !variant || variant.stockStatus === 'OUT_OF_STOCK' || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      this.error.set('Vui lòng chọn mẫu còn hàng và số lượng từ 1 đến 99.'); return;
    }
    this.cart.add(product, variant, quantity);
    this.choosing.set(false); this.message.set('Đã thêm sản phẩm vào giỏ hàng.');
    if (buyNow) void this.router.navigate(['/checkout']);
  }
}
