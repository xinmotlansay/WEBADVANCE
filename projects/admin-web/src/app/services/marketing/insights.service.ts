import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/insights';

export type Segment = 'RETAIN' | 'NURTURE' | 'NO_SPEND' | 'LET_BE';

export interface ReasonStat {
  feature: string;
  label: string;
  direction: 'UP' | 'DOWN';
  customers: number;
  share: number;
}

export interface SegmentInsight {
  segment: Segment;
  customers: number;
  controls: number;
  avgPChurn: number;
  clvAtRisk: number;
  topReasons: ReasonStat[];
  /** Chỉ ô Giữ ngay có (12%, giả định của mô hình); các ô khác null. */
  suggestedDiscountPct: number | null;
  /** Khách có lãi kỳ vọng dương ở mức gợi ý, kể cả nhóm đối chứng; ngoài ô Giữ ngay luôn 0. */
  eligibleCustomers: number;
}

export interface VoucherPreview {
  discountPercent: number;
  /** Tỷ lệ cứu đã dùng để lọc và tính Σnet. */
  saveRate: number;
  recipients: number;
  controls: number;
  /** Số khách bị loại vì còn giữ voucher ML của chiến dịch trước. */
  cooledDown: number;
  /** Σ lợi nhuận kỳ vọng (Neslin, s = 30%) của nhóm nhận ở mức giảm này. */
  expectedNet: number;
  /** Σ chi phí voucher kỳ vọng của nhóm nhận. */
  expectedCost: number;
  /** Số người nhận và Σnet ở từng mức 5–30%. */
  curve: { pct: number; recipients: number; expectedNet: number }[];
}

export interface Insights {
  hasData: boolean;
  scoredAt: string | null;
  cutoff: string | null;
  modelVersion: string | null;
  mlAvailable: boolean;
  totalCustomers: number;
  clvAtRisk: number;
  segments: SegmentInsight[];
}

export interface SegmentVoucherPayload {
  discountPercent: number;
  maxDiscountValue: number;
  minOrderValue: number;
  validDays: number;
  /** Bỏ trống = giả định 30%. */
  saveRate?: number;
}

export interface CampaignRow {
  id: string;
  code: string;
  discountPercent: number;
  sentAt: string;
  endDate: string;
  /** Số khách đã xem dải thông báo ưu đãi phía khách. */
  seen: number;
  used: number;
  treated: { n: number; returned: number };
  control: { n: number; returned: number };
  treatedRate: number | null;
  controlRate: number | null;
  liftPoints: number | null;
  /** Khoảng tin cậy 95% (Wald) của chênh lệch, điểm %; null khi không tính được. */
  liftCI: [number, number] | null;
  /** Khoảng tin cậy không chứa 0. */
  significant: boolean;
  enoughSample: boolean;
  running: boolean;
}

/** ŝ gộp của các chiến dịch có nhóm đối chứng riêng. */
export interface SaveRateSummary {
  assumed: number;
  campaigns: number;
  treated: { n: number; returned: number };
  control: { n: number; returned: number };
  measured: { s: number; ci: [number, number] | null; significant: boolean } | null;
  enoughSample: boolean;
  /** Có đơn do script mô phỏng tạo. */
  simulated: boolean;
}

export interface CampaignReport {
  campaigns: CampaignRow[];
  saveRate: SaveRateSummary;
}

@Injectable({ providedIn: 'root' })
export class InsightsApi {
  private readonly http = inject(HttpClient);

  insights(): Observable<Insights> {
    return this.http.get<ApiResponse<Insights>>(BASE).pipe(map((r) => r.data));
  }

  rescore(): Observable<{ scored: number; modelVersion: string }> {
    return this.http
      .post<ApiResponse<{ scored: number; modelVersion: string }>>(`${BASE}/rescore`, {})
      .pipe(map((r) => r.data));
  }

  /** Số người sẽ nhận và số đối chứng ở một mức giảm (ô Giữ ngay và net > 0), chưa tạo gì. */
  voucherPreview(discountPercent: number, saveRate?: number): Observable<VoucherPreview> {
    const params = saveRate === undefined ? { discountPercent } : { discountPercent, saveRate };
    return this.http
      .get<ApiResponse<VoucherPreview>>(`${BASE}/retain-voucher/preview`, { params })
      .pipe(map((r) => r.data));
  }

  createRetainVoucher(
    body: SegmentVoucherPayload,
  ): Observable<{ code: string; recipients: number; endDate: string }> {
    return this.http
      .post<ApiResponse<{ code: string; recipients: number; endDate: string }>>(
        `${BASE}/retain-voucher`,
        body,
      )
      .pipe(map((r) => r.data));
  }

  campaigns(): Observable<CampaignReport> {
    return this.http.get<ApiResponse<CampaignReport>>(`${BASE}/campaigns`).pipe(map((r) => r.data));
  }
}
