import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/schedule';

export type ScheduleType = 'BANNER' | 'COLLECTION' | 'INSPIRATION' | 'ANNOUNCEMENT';

export interface ScheduleEvent {
  key: string;
  type: ScheduleType;
  id: string;
  title: string;
  thumbnail: string | null;
  at: string;
  endAt: string | null;
  state: 'SCHEDULED' | 'PUBLISHED';
  editPath: string;
}

export const TYPE_LABEL: Record<ScheduleType, string> = {
  BANNER: 'Banner',
  COLLECTION: 'Collection',
  INSPIRATION: 'Nguồn cảm hứng',
  ANNOUNCEMENT: 'Thanh thông báo',
};

/** Giờ hẹn phải sau hiện tại ít nhất ngần này (khớp server). */
export const MIN_LEAD_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ScheduleApi {
  private readonly http = inject(HttpClient);

  list(from: Date, to: Date): Observable<ScheduleEvent[]> {
    return this.http
      .get<ApiResponse<ScheduleEvent[]>>(BASE, { params: { from: from.toISOString(), to: to.toISOString() } })
      .pipe(map((r) => r.data));
  }

  reschedule(type: ScheduleType, id: string, publishAt: Date): Observable<unknown> {
    return this.http.post(`${BASE}/${type}/${id}/reschedule`, { publishAt: publishAt.toISOString() });
  }

  cancel(type: ScheduleType, id: string): Observable<unknown> {
    return this.http.post(`${BASE}/${type}/${id}/cancel`, {});
  }
}
