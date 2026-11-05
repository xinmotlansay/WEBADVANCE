import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

export type ContentKey = 'HOME' | 'ANNOUNCEMENT_BAR' | 'LANDING';

const BASE = '/api/v1/admin/marketing/content';

export type BlockType = 'BRAND_INTRO' | 'FEATURED_PRODUCTS' | 'COLLECTIONS' | 'PROMOTION' | 'LATEST_ARTICLES';
export type SaveAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';

export const BLOCK_LABEL: Record<BlockType, string> = {
  BRAND_INTRO: 'Giới thiệu thương hiệu',
  FEATURED_PRODUCTS: 'Sản phẩm nổi bật',
  COLLECTIONS: 'Bộ sưu tập',
  PROMOTION: 'Khuyến mãi',
  LATEST_ARTICLES: 'Bài viết mới',
};

export interface HomeBlock {
  type: BlockType;
  enabled: boolean;
  title: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  ctaUrl: string;
  productIds: string[];
  /** Dữ liệu cũ của khối Bộ sưu tập; khối mới dùng `collectionIds`. */
  categoryIds: string[];
  collectionIds: string[];
  promotionIds: string[];
}
export interface BarData {
  enabled: boolean;
  text: string;
  linkUrl: string;
  startAt: string;
  endAt: string;
}

export interface ContentArea<T> {
  key: string;
  draft: T;
  published: T | null;
  scheduledAt: string | null;
  version: number;
  updatedAt: string | null;
  name: string;
  seoTitle: string;
  metaDescription: string;
  hidden: boolean;
  warnings: string[];
  warning?: string | null;
}

export interface SaveBody {
  data: unknown;
  action: SaveAction;
  publishAt?: string;
  version: number;
  name?: string;
  seoTitle?: string;
  metaDescription?: string;
}

export interface VersionRow {
  id: number;
  savedAt: string;
  action: 'PUBLISH' | 'SCHEDULE';
}

export interface LandingRow {
  slug: string;
  name: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'HIDDEN';
  updatedAt: string | null;
}

/** `path` = `HOME`, `ANNOUNCEMENT_BAR` hoặc `landing-pages/<slug>`. */
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Observable<ContentArea<T>> {
    return this.http.get<ApiResponse<ContentArea<T>>>(`${BASE}/${path}`).pipe(map((r) => r.data));
  }

  save<T>(path: string, body: SaveBody): Observable<ContentArea<T>> {
    return this.http.put<ApiResponse<ContentArea<T>>>(`${BASE}/${path}`, body).pipe(map((r) => r.data));
  }

  versions(path: string): Observable<VersionRow[]> {
    return this.http.get<ApiResponse<VersionRow[]>>(`${BASE}/${path}/versions`).pipe(map((r) => r.data));
  }

  restore<T>(path: string, id: number, version: number): Observable<ContentArea<T>> {
    return this.http
      .post<ApiResponse<ContentArea<T>>>(`${BASE}/${path}/versions/${id}/restore`, { version })
      .pipe(map((r) => r.data));
  }

  landingList(): Observable<LandingRow[]> {
    return this.http.get<ApiResponse<LandingRow[]>>(`${BASE}/landing-pages`).pipe(map((r) => r.data));
  }

  landingCreate(name: string, slug: string): Observable<ContentArea<unknown>> {
    return this.http.post<ApiResponse<ContentArea<unknown>>>(`${BASE}/landing-pages`, { name, slug }).pipe(map((r) => r.data));
  }

  landingHide(slug: string, hidden: boolean): Observable<unknown> {
    return this.http.post(`${BASE}/landing-pages/${slug}/${hidden ? 'hide' : 'show'}`, {});
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${BASE}/images`, form).pipe(map((r) => r.data));
  }
}
