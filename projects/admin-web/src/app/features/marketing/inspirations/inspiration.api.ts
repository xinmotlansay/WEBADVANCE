import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';
import type { CollectionStatus } from '../collections/collection.api';

export { STATUS_BADGE, STATUS_LABEL } from '../collections/collection.api';

const BASE = '/api/v1/admin/marketing/inspirations';
export const MAX_INSPIRATION_PRODUCTS = 12;

export interface InspirationRow {
  id: string;
  imageUrl: string;
  productIds: string[];
  productCount: number;
  inactiveProductIds: string[];
  status: CollectionStatus;
  displayOrder: number;
  flags: 'INACTIVE_PRODUCT'[];
  version: number;
}

export interface InspirationBody {
  imageUrl: string;
  productIds: string[];
  version?: number;
}

@Injectable({ providedIn: 'root' })
export class InspirationApi {
  private readonly http = inject(HttpClient);

  list(status = ''): Observable<InspirationRow[]> {
    const params: Record<string, string> = status ? { status } : {};
    return this.http.get<ApiResponse<InspirationRow[]>>(BASE, { params }).pipe(map((r) => r.data));
  }

  get(id: string): Observable<InspirationRow> {
    return this.http.get<ApiResponse<InspirationRow>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: InspirationBody): Observable<InspirationRow> {
    return this.http.post<ApiResponse<InspirationRow>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: InspirationBody): Observable<InspirationRow> {
    return this.http.patch<ApiResponse<InspirationRow>>(`${BASE}/${id}`, body).pipe(map((r) => r.data));
  }

  setHidden(id: string, hidden: boolean): Observable<InspirationRow> {
    return this.http
      .post<ApiResponse<InspirationRow>>(`${BASE}/${id}/${hidden ? 'hide' : 'show'}`, {})
      .pipe(map((r) => r.data));
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/${id}`);
  }

  reorder(ids: string[]): Observable<unknown> {
    return this.http.post(`${BASE}/reorder`, { ids });
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${BASE}/images`, form).pipe(map((r) => r.data));
  }
}
