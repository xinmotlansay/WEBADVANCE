import { computed, Injectable, signal } from '@angular/core';
import { ProductDetail } from 'shared';

export interface CartItem {
  productId: string; slug: string; name: string; thumbnail: string;
  variantId: string; label: string; unitPrice: number; quantity: number;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly items = signal<CartItem[]>(this.read());
  readonly count = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));
  readonly total = computed(() => this.items().reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  add(product: ProductDetail, variant: ProductDetail['variants'][number], quantity: number): void {
    const existing = this.items().find((item) => item.variantId === variant.id);
    const item: CartItem = {
      productId: product.id, slug: product.slug, name: product.name, thumbnail: product.thumbnail,
      variantId: variant.id, label: [variant.color, variant.material, variant.sku].filter(Boolean).join(' · '),
      unitPrice: variant.price.final, quantity: Math.min(99, (existing?.quantity ?? 0) + quantity),
    };
    this.save([...this.items().filter((entry) => entry.variantId !== variant.id), item]);
  }
  quantity(id: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
    this.save(this.items().map((item) => item.variantId === id ? { ...item, quantity } : item));
  }
  remove(id: string): void { this.save(this.items().filter((item) => item.variantId !== id)); }
  clear(): void { this.save([]); }
  private save(items: CartItem[]): void {
    this.items.set(items);
    try { localStorage.setItem('caraveso.cart.v1', JSON.stringify(items)); } catch { /* Keep in memory. */ }
  }
  private read(): CartItem[] {
    try {
      const data: unknown = JSON.parse(localStorage.getItem('caraveso.cart.v1') ?? '[]');
      if (!Array.isArray(data)) return [];
      return data.filter((item): item is CartItem => item &&
        ['productId', 'slug', 'name', 'thumbnail', 'variantId', 'label'].every((key) => typeof item[key] === 'string') &&
        Number.isFinite(item.unitPrice) && item.unitPrice >= 0 &&
        Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99);
    } catch { return []; }
  }
}
