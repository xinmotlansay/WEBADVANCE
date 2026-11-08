import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/content';

export type SaveAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';

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

/** `path` = `ANNOUNCEMENT_BAR`. */
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

  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${BASE}/images`, form).pipe(map((r) => r.data));
  }
}
