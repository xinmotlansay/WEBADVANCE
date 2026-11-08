import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { ApiResponse } from 'shared';

@Injectable({ providedIn: 'root' })
export class ProductSearchService {
  private readonly http = inject(HttpClient);
  readonly history = signal<string[]>(this.readHistory());

  suggestions(q: string) {
    return this.http
      .get<ApiResponse<string[]>>('/api/v1/search/suggestions', {
        params: new HttpParams().set('q', q),
      })
      .pipe(map((r) => r.data));
  }

  remember(q: string): void {
    const value = q.trim().slice(0, 120);
    if (!value) return;
    this.history.update((items) => [value, ...items.filter((item) => item !== value)].slice(0, 8));
    try {
      localStorage.setItem('caraveso.search-history', JSON.stringify(this.history()));
    } catch {
      /* Storage can be disabled. */
    }
  }

  clear(): void {
    this.history.set([]);
    try {
      localStorage.removeItem('caraveso.search-history');
    } catch {
      /* Storage can be disabled. */
    }
  }

  private readHistory(): string[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('caraveso.search-history') ?? '[]');
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').slice(0, 8)
        : [];
    } catch {
      return [];
    }
  }
}
