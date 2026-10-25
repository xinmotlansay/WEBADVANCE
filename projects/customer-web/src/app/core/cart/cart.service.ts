import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CartService {
  readonly itemCount = signal(0);

  add(quantity: number): void {
    this.itemCount.update((count) => count + quantity);
  }
}
