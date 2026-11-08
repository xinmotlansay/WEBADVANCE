import { Injectable } from '@angular/core';
import { ImageSearchItem } from 'shared';

@Injectable({ providedIn: 'root' })
export class ImageSearchResultsService {
  private readonly results = new Map<string, ImageSearchItem[]>();
  private readonly previews = new Map<string, string>();

  /** `preview`: ảnh thu nhỏ (data URL hoặc đường dẫn) của ảnh người dùng đã tải lên. */
  save(items: ImageSearchItem[], preview = ''): string {
    const id = crypto.randomUUID();
    this.results.set(id, items);
    if (preview) this.previews.set(id, preview);
    try {
      sessionStorage.setItem(`caraveso.image-search.${id}`, JSON.stringify(items));
      if (preview) sessionStorage.setItem(`caraveso.image-search.${id}.preview`, preview);
    } catch { /* Results remain available when storage is disabled. */ }
    return id;
  }

  preview(id: string): string {
    const cached = this.previews.get(id);
    if (cached !== undefined) return cached;
    try {
      return sessionStorage.getItem(`caraveso.image-search.${id}.preview`) ?? '';
    } catch { return ''; }
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
