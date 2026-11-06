import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/articles';

export type ArticleType = 'ARTICLE' | 'ANNOUNCEMENT';
export type ArticleStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'HIDDEN';
export type ArticleAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';

export const CATEGORIES = ['Cảm hứng thiết kế', 'Mẹo bảo quản', 'Tin tức CaraVeso', 'Khác'] as const;
export const TYPE_LABEL: Record<ArticleType, string> = { ARTICLE: 'Bài viết', ANNOUNCEMENT: 'Thông báo' };
export const STATUS_LABEL: Record<ArticleStatus, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHED: 'Đã đăng',
  HIDDEN: 'Tạm ẩn',
};
export const STATUS_BADGE: Record<ArticleStatus, string> = {
  DRAFT: '',
  SCHEDULED: 'cv-badge--info',
  PUBLISHED: 'cv-badge--success',
  HIDDEN: 'cv-badge--attention',
};

export interface ArticleRow {
  id: string;
  code: string;
  title: string;
  slug: string | null;
  type: ArticleType;
  category: string | null;
  coverUrl: string | null;
  summary: string;
  content?: string;
  tags: string[];
  relatedProductIds: string[];
  seoTitle: string;
  metaDescription: string;
  pinned: boolean;
  status: ArticleStatus;
  publishAt: string | null;
  viewCount: number;
  authorId: string;
  version: number;
}

export interface ArticleList {
  items: ArticleRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArticleFilter {
  type?: string;
  status?: string;
  category?: string;
  q?: string;
  page: number;
}

export interface ArticleBody {
  title: string;
  slug?: string;
  type: ArticleType;
  category: string | null;
  coverUrl: string | null;
  summary: string;
  content: string;
  tags: string[];
  relatedProductIds: string[];
  seoTitle: string;
  metaDescription: string;
  pinned: boolean;
  action: ArticleAction;
  publishAt?: string;
  version?: number;
}

@Injectable({ providedIn: 'root' })
export class ArticleApi {
  private readonly http = inject(HttpClient);

  list(f: ArticleFilter): Observable<ArticleList> {
    const params: Record<string, string> = { page: String(f.page) };
    for (const k of ['type', 'status', 'category', 'q'] as const) if (f[k]) params[k] = f[k];
    return this.http.get<ApiResponse<ArticleList>>(BASE, { params }).pipe(map((r) => r.data));
  }

  get(id: string): Observable<ArticleRow> {
    return this.http.get<ApiResponse<ArticleRow>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: ArticleBody): Observable<ArticleRow> {
    return this.http.post<ApiResponse<ArticleRow>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: ArticleBody): Observable<ArticleRow> {
    return this.http.put<ApiResponse<ArticleRow>>(`${BASE}/${id}`, body).pipe(map((r) => r.data));
  }

  setHidden(id: string, hidden: boolean): Observable<ArticleRow> {
    return this.http.post<ApiResponse<ArticleRow>>(`${BASE}/${id}/${hidden ? 'hide' : 'show'}`, {}).pipe(map((r) => r.data));
  }

  uploadCover(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${BASE}/cover`, form).pipe(map((r) => r.data));
  }
}

export const dateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
