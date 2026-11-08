import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/announcements';

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'HIDDEN';

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang hiển thị',
  ENDED: 'Đã kết thúc',
  HIDDEN: 'Đã ẩn',
};
export const ANNOUNCEMENT_STATUS_BADGE: Record<AnnouncementStatus, string> = {
  DRAFT: 'cv-badge--neutral',
  SCHEDULED: 'cv-badge--info',
  ACTIVE: 'cv-badge--success',
  ENDED: 'cv-badge--neutral',
  HIDDEN: 'cv-badge--attention',
};

export interface AnnouncementRow {
  id: string;
  text: string;
  linkUrl: string;
  status: AnnouncementStatus;
  publishAt: string | null;
  endAt: string | null;
  displayOrder: number;
  version: number;
}

export interface AnnouncementList {
  items: AnnouncementRow[];
  counts: Record<AnnouncementStatus | 'ALL', number>;
}

export interface AnnouncementBody {
  text: string;
  linkUrl: string;
  endAt: string | null;
  version?: number;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementApi {
  private readonly http = inject(HttpClient);

  list(status?: AnnouncementStatus): Observable<AnnouncementList> {
    return this.http
      .get<ApiResponse<AnnouncementList>>(BASE, { params: status ? { status } : {} })
      .pipe(map((r) => r.data));
  }

  get(id: string): Observable<AnnouncementRow> {
    return this.http.get<ApiResponse<AnnouncementRow>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: AnnouncementBody): Observable<AnnouncementRow> {
    return this.http.post<ApiResponse<AnnouncementRow>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: AnnouncementBody): Observable<AnnouncementRow> {
    return this.http.patch<ApiResponse<AnnouncementRow>>(`${BASE}/${id}`, body).pipe(map((r) => r.data));
  }

  publish(id: string, publishAt?: Date): Observable<AnnouncementRow> {
    return this.http
      .post<ApiResponse<AnnouncementRow>>(`${BASE}/${id}/publish`, publishAt ? { publishAt: publishAt.toISOString() } : {})
      .pipe(map((r) => r.data));
  }

  setHidden(id: string, hidden: boolean): Observable<AnnouncementRow> {
    return this.http.post<ApiResponse<AnnouncementRow>>(`${BASE}/${id}/${hidden ? 'hide' : 'show'}`, {}).pipe(map((r) => r.data));
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/${id}`);
  }

  reorder(ids: string[]): Observable<unknown> {
    return this.http.post(`${BASE}/reorder`, { ids });
  }
}
