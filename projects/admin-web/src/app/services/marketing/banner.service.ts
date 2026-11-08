import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/banners';

export type BannerPosition = 'HOME_SLIDER' | 'HOME_MIDDLE' | 'CATEGORY' | 'POPUP';
export type BannerStatus = 'VISIBLE' | 'SCHEDULED' | 'HIDDEN' | 'DRAFT' | 'EXPIRED';

export interface BannerRow {
  id: string;
  code: string;
  position: BannerPosition;
  title: string;
  content: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string;
  ctaLabel: string | null;
  openInNewTab: boolean;
  startDate: string;
  endDate: string | null;
  displayOrder: number;
  status: BannerStatus;
  impressions: number;
  clicks: number;
  ctr: number | null;
  flags: 'BROKEN_LINK'[];
  categoryIds: string[];
  popupFrequency: 'SESSION' | 'DAILY' | 'ONCE' | null;
  version: number;
}

export interface PositionCount {
  label: string;
  visible: number;
  max: number | null;
  recommended: string;
}

export interface BannerList {
  items: BannerRow[];
  counts: Record<BannerPosition, PositionCount>;
}

export interface BannerBody {
  position?: BannerPosition;
  title?: string;
  content?: string;
  imageUrl?: string;
  mobileImageUrl?: string | null;
  ctaLabel?: string | null;
  linkUrl?: string | null;
  openInNewTab?: boolean;
  startNow?: boolean;
  startDate?: string;
  endDate?: string | null;
  displayOrder?: number;
  categoryIds?: string[];
  popupFrequency?: 'SESSION' | 'DAILY' | 'ONCE';
  publish?: boolean;
  version?: number;
}

export interface UploadResult {
  url: string;
  width: number;
  height: number;
}

@Injectable({ providedIn: 'root' })
export class BannerApi {
  private readonly http = inject(HttpClient);

  list(position: BannerPosition, status?: string, q?: string): Observable<BannerList> {
    const params: Record<string, string> = { position };
    if (status) params['status'] = status;
    if (q) params['q'] = q;
    return this.http.get<ApiResponse<BannerList>>(BASE, { params }).pipe(map((r) => r.data));
  }

  get(id: string): Observable<BannerRow> {
    return this.http.get<ApiResponse<BannerRow>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: BannerBody): Observable<BannerRow> {
    return this.http.post<ApiResponse<BannerRow>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: BannerBody): Observable<BannerRow> {
    return this.http.patch<ApiResponse<BannerRow>>(`${BASE}/${id}`, body).pipe(map((r) => r.data));
  }

  hide(id: string): Observable<BannerRow> {
    return this.http.post<ApiResponse<BannerRow>>(`${BASE}/${id}/hide`, {}).pipe(map((r) => r.data));
  }

  show(id: string): Observable<BannerRow> {
    return this.http.post<ApiResponse<BannerRow>>(`${BASE}/${id}/show`, {}).pipe(map((r) => r.data));
  }

  remove(ids: string[]): Observable<{ deleted: number }> {
    return this.http
      .post<ApiResponse<{ deleted: number }>>(`${BASE}/delete`, { ids })
      .pipe(map((r) => r.data));
  }

  duplicate(id: string, position: BannerPosition): Observable<BannerRow> {
    return this.http
      .post<ApiResponse<BannerRow>>(`${BASE}/${id}/duplicate`, { position })
      .pipe(map((r) => r.data));
  }

  reorder(position: BannerPosition, ids: string[]): Observable<unknown> {
    return this.http.post(`${BASE}/reorder`, { position, ids });
  }

  upload(file: File, position: BannerPosition, kind: 'desktop' | 'mobile'): Observable<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<ApiResponse<UploadResult>>(`${BASE}/images`, form, { params: { position, kind } })
      .pipe(map((r) => r.data));
  }
}
