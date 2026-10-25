import { Injectable } from '@angular/core';
import { ImageSearchItem } from 'shared';

@Injectable({ providedIn: 'root' })
export class ImageSearchResultsService {
  private readonly results = new Map<string, ImageSearchItem[]>();

  save(items: ImageSearchItem[]): string {
    const id = crypto.randomUUID();
    this.results.set(id, items);
    try {
      sessionStorage.setItem(`caraveso.image-search.${id}`, JSON.stringify(items));
    } catch { /* Results remain available when storage is disabled. */ }
    return id;
  }

  get(id: string): ImageSearchItem[] | undefined {
    const cached = this.results.get(id);
    if (cached) return cached;
    try {
      const stored = sessionStorage.getItem(`caraveso.image-search.${id}`);
      if (!stored) return undefined;
      const items: unknown = JSON.parse(stored);
      if (!Array.isArray(items)) return undefined;
      this.results.set(id, items);
      return items;
    } catch { return undefined; }
  }
}
