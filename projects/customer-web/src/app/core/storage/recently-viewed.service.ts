import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from './local-store';

export interface ViewedProduct {
  slug: string;
  name: string;
}

const KEY = 'caraveso.recentlyViewed';
const MAX_ITEMS = 10;

/** Lịch sử xem sản phẩm, lưu ở trình duyệt (mới nhất đứng đầu). */
@Injectable({ providedIn: 'root' })
export class RecentlyViewedService {
  readonly items = signal<ViewedProduct[]>(readLocal<ViewedProduct[]>(KEY, []));

  add(product: ViewedProduct): void {
    const next = [product, ...this.items().filter((p) => p.slug !== product.slug)].slice(
      0,
      MAX_ITEMS,
    );
    this.items.set(next);
    writeLocal(KEY, next);
  }
}
