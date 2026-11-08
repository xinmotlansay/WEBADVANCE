import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/dashboard';

export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface RangeQuery {
  range: RangeKey;
  from?: string;
  to?: string;
}

export interface Metric {
  value: number;
  /** % thay đổi so với kỳ liền trước; `null` khi kỳ trước bằng 0. */
  change: number | null;
}

export interface TopRow {
  id: string;
  name: string;
}

export interface DashboardData {
  range: { key: RangeKey; from: string; to: string };
  updatedAt: string;
  cards: {
    promotions: { running: number; upcoming: number; paused: number };
    vouchersActive: number;
    banners: Record<string, number>;
  };
  metrics: { offerOrders: Metric; discountTotal: Metric; voucherUses: Metric; revenue: Metric };
  top: {
    vouchers: (TopRow & { uses: number })[];
    promotions: (TopRow & { revenue: number })[];
  };
  attention: { kind: string; text: string; link: string }[];
}

export interface EffectivenessData {
  range: { key: RangeKey; from: string; to: string };
  updatedAt: string;
  summary: {
    offerOrders: number;
    doneOrders: number;
    cancelRate: number;
    discountTotal: number;
    revenue: number;
    aovWithOffer: number | null;
    aovWithoutOffer: number | null;
    costRatio: number | null;
  };
  byPromotion: {
    id: string;
    code: string;
    name: string;
    orders: number;
    units: number;
    discount: number;
    revenue: number;
    cancelRate: number;
  }[];
  byVoucher: {
    id: string;
    code: string;
    uses: number;
    usedCount: number;
    totalUsageLimit: number | null;
    refunded: number;
    newCustomers: number;
    discount: number;
    revenue: number;
  }[];
  daily: { date: string; orders: number; voucherUses: number; discount: number; revenue: number }[];
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  private params(q: RangeQuery): HttpParams {
    let p = new HttpParams().set('range', q.range);
    if (q.range === 'custom' && q.from && q.to) p = p.set('from', q.from).set('to', q.to);
    return p;
  }

  dashboard(q: RangeQuery): Observable<DashboardData> {
    return this.http
      .get<ApiResponse<DashboardData>>(BASE, { params: this.params(q) })
      .pipe(map((r) => r.data));
  }

  effectiveness(q: RangeQuery): Observable<EffectivenessData> {
    return this.http
      .get<ApiResponse<EffectivenessData>>(`${BASE}/effectiveness`, { params: this.params(q) })
      .pipe(map((r) => r.data));
  }
}
