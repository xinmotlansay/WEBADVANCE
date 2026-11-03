import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/content';

export type ContentKey = 'HOME' | 'ANNOUNCEMENT_BAR';
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
  categoryIds: string[];
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
  key: ContentKey;
  draft: T;
  published: T | null;
  scheduledAt: string | null;
  version: number;
  updatedAt: string | null;
  warnings: string[];
  warning?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(HttpClient);

  get<T>(key: ContentKey): Observable<ContentArea<T>> {
    return this.http.get<ApiResponse<ContentArea<T>>>(`${BASE}/${key}`).pipe(map((r) => r.data));
  }

  save<T>(key: ContentKey, body: { data: unknown; action: SaveAction; publishAt?: string; version: number }): Observable<ContentArea<T>> {
    return this.http.put<ApiResponse<ContentArea<T>>>(`${BASE}/${key}`, body).pipe(map((r) => r.data));
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${BASE}/images`, form).pipe(map((r) => r.data));
  }
}
