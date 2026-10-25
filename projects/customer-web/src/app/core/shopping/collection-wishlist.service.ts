import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class CollectionWishlistService {
  readonly ids = signal<string[]>(this.read());
  toggle(id: string): void {
    this.ids.update((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
    try { localStorage.setItem('caraveso.collection-favorites', JSON.stringify(this.ids())); } catch { /* Keep in memory. */ }
  }
  private read(): string[] {
    try {
      const data: unknown = JSON.parse(localStorage.getItem('caraveso.collection-favorites') ?? '[]');
      return Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  }
}
