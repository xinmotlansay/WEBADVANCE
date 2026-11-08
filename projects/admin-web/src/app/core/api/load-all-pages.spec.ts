import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { loadAllPages } from './load-all-pages';

describe('loadAllPages', () => {
  it('fetches every page and preserves the returned item order', async () => {
    const requestedPages: number[] = [];
    const items = await new Promise<string[]>((resolve, reject) => {
      loadAllPages((page, limit) => {
        requestedPages.push(page);
        expect(limit).toBe(100);
        return of({
          success: true,
          data: [`item-${page}`],
          meta: { page, limit, total: 2, totalPages: 2 },
        });
      }).subscribe({ next: resolve, error: reject });
    });

    expect(requestedPages).toEqual([1, 2]);
    expect(items).toEqual(['item-1', 'item-2']);
  });
});
