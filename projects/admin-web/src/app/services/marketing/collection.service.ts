import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/collections';

export type CollectionStatus = 'VISIBLE' | 'HIDDEN';
export const STATUS_LABEL: Record<CollectionStatus, string> = { VISIBLE: 'Đang hiển thị', HIDDEN: 'Đang ẩn' };
export const STATUS_BADGE: Record<CollectionStatus, string> = {
  VISIBLE: 'cv-badge--success',
  HIDDEN: 'cv-badge--attention',
};

export interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  slogan: string;
  thumbnail: string | null;
  imageCount: number;
  productCount: number;
  status: CollectionStatus;
  displayOrder: number;
  flags: 'INACTIVE_PRODUCT'[];
  version: number;
}

export interface Hotspot {
  productId: string;
  x: number;
  y: number;
}

export interface CollectionImage {
  url: string;
  title: string;
  description: string;
  isThumbnail: boolean;
  hotspots: Hotspot[];
}

export interface CollectionDetail extends CollectionRow {
  shortDescription: string;
  description: string;
  productIds: string[];
  inactiveProductIds: string[];
  images: CollectionImage[];
}

export interface CollectionBody {
  name: string;
  slug?: string;
  slogan: string;
  shortDescription: string;
  description: string;
  productIds: string[];
  /** Không gửi = giữ ảnh hiện có. */
  images?: CollectionImage[];
  version?: number;
}

@Injectable({ providedIn: 'root' })
export class CollectionApi {
  private readonly http = inject(HttpClient);

  list(f: { status?: string; q?: string } = {}): Observable<CollectionRow[]> {
    const params: Record<string, string> = {};
    if (f.status) params['status'] = f.status;
    if (f.q) params['q'] = f.q;
    return this.http.get<ApiResponse<CollectionRow[]>>(BASE, { params }).pipe(map((r) => r.data));
  }

  get(id: string): Observable<CollectionDetail> {
    return this.http.get<ApiResponse<CollectionDetail>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: CollectionBody): Observable<CollectionDetail> {
    return this.http.post<ApiResponse<CollectionDetail>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: CollectionBody): Observable<CollectionDetail> {
    return this.http.patch<ApiResponse<CollectionDetail>>(`${BASE}/${id}`, body).pipe(map((r) => r.data));
  }

  setHidden(id: string, hidden: boolean): Observable<CollectionDetail> {
    return this.http
      .post<ApiResponse<CollectionDetail>>(`${BASE}/${id}/${hidden ? 'hide' : 'show'}`, {})
      .pipe(map((r) => r.data));
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/${id}`);
  }

  reorder(ids: string[]): Observable<unknown> {
    return this.http.post(`${BASE}/reorder`, { ids });
  }

  uploadImage(file: File): Observable<{ url: string; width: number; height: number }> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<ApiResponse<{ url: string; width: number; height: number }>>(`${BASE}/images`, form)
      .pipe(map((r) => r.data));
  }
}
