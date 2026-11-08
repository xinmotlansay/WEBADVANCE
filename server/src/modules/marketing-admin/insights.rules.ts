import type { CustomerScoreDoc, ScoreSegment } from './customer-score.model.js';

export const SEGMENTS: ScoreSegment[] = ['RETAIN', 'NURTURE', 'NO_SPEND', 'LET_BE'];

/** Nhãn tiếng Việt của feature ML (khớp `LABELS` trong src/churn_model.py của repo DATATHON-ML); feature lạ giữ nguyên tên. */
const FEATURE_LABEL: Record<string, string> = {
  frequency: 'Số đơn đã mua',
  recency_days: 'Số ngày kể từ lần mua cuối',
  monetary: 'Tổng chi tiêu',
  mean_gap_days: 'Chu kỳ mua trung bình',
  std_gap_days: 'Độ lệch chu kỳ mua',
  review_rate: 'Tỷ lệ đơn có đánh giá',
  avg_installments: 'Số kỳ trả góp trung bình',
  n_categories: 'Số danh mục đã mua',
  main_source: 'Kênh đặt đơn chủ đạo',
  main_category: 'Danh mục chủ đạo',
  region: 'Vùng miền',
};

export type ScoreRow = Pick<CustomerScoreDoc, 'pChurn' | 'clv' | 'segment' | 'topReasons'> &
  Partial<Pick<CustomerScoreDoc, 'isControl' | 'voucherCost'>>;

/** Giả định của hợp đồng ML: `net` tính ở tỷ lệ cứu 30%, `voucherCost` = 12% giá trị đơn TB. */
export const S_REF = 0.3;
const REF_DISCOUNT = 0.12;
/** Mức giảm mặc định của biểu mẫu (%): đúng giả định của mô hình, nên khách đủ điều kiện = khách có `net > 0`. */
export const DEFAULT_DISCOUNT_PCT = REF_DISCOUNT * 100;
/** Dải mức giảm (%) của đường cong lợi nhuận kỳ vọng trong hộp thoại voucher. */
export const CURVE_PCTS = Array.from({ length: 26 }, (_, i) => 5 + i);

type Econ = { pChurn: number; clv: number; voucherCost?: number };

/** Giá trị voucher δ ở mức giảm `discountPct`, quy từ voucherCost = 12% × giá trị đơn; null khi thiếu. */
const deltaAt = (r: Econ, discountPct: number) =>
  r.voucherCost && r.voucherCost > 0 ? (r.voucherCost * discountPct) / DEFAULT_DISCOUNT_PCT : null;

/**
 * Mức giảm (%) hòa vốn của một khách: net = p·s·(K − δ) − (1 − p)·δ = 0 → δ = p·s·K / (p·s + 1 − p),
 * quy ra % giá trị đơn nhờ voucherCost = 12% × giá trị đơn.
 */
export function breakEvenDiscountPct(r: Econ, s = S_REF): number | null {
  if (!r.voucherCost || r.voucherCost <= 0) return null;
  const ps = r.pChurn * s; // r.pChurn là xác suất rời bỏ; cứu được khách rời bỏ mới có lợi
  const delta = (ps * r.clv) / (ps + 1 - r.pChurn);
  return (delta / r.voucherCost) * REF_DISCOUNT * 100;
}

/** Lợi nhuận kỳ vọng của một khách khi phát voucher (Neslin et al. 2006): p·s·(K − δ) − (1 − p)·δ. Ở 12%, s = 30% trùng `net` của ML. */
export function expectedNet(r: Econ, discountPct: number, s = S_REF): number | null {
  const d = deltaAt(r, discountPct);
  return d === null ? null : r.pChurn * s * (r.clv - d) - (1 - r.pChurn) * d;
}

/** Chi phí voucher kỳ vọng: khách vẫn mua dùng mã (1 − p)·δ cộng khách được cứu dùng mã p·s·δ. */
export function expectedCost(r: Econ, discountPct: number, s = S_REF): number | null {
  const d = deltaAt(r, discountPct);
  return d === null ? null : (1 - r.pChurn) * d + r.pChurn * s * d;
}

/**
 * Quy tắc phát voucher (tasks/voucher-rule-plan.md): ô Giữ ngay và net > 0 tại mức giảm `discountPct`.
 * Ma trận chọn ô, net chọn khách. net > 0 ⇔ mức hòa vốn của khách vượt mức giảm; ở 12% trùng `net > 0` của ML.
 */
export function eligibleForVoucher(
  r: Econ & { segment: ScoreSegment },
  discountPct: number,
  s = S_REF,
): boolean {
  if (r.segment !== 'RETAIN') return false;
  const be = breakEvenDiscountPct(r, s);
  return be !== null && be > discountPct;
}

/** Số người nhận và Σnet ở từng mức 5–30% cho các khách ứng viên, trong một lượt duyệt. */
export function voucherCurve(rows: (Econ & { segment: ScoreSegment })[], s = S_REF) {
  const curve = CURVE_PCTS.map((pct) => ({ pct, recipients: 0, expectedNet: 0 }));
  for (const r of rows) {
    if (r.segment !== 'RETAIN') continue;
    const be = breakEvenDiscountPct(r, s);
    if (be === null) continue;
    for (const c of curve) {
      if (be <= c.pct) break; // các mức sau còn cao hơn, cũng lỗ
      c.recipients += 1;
      c.expectedNet += expectedNet(r, c.pct, s)!;
    }
  }
  return curve;
}

/**
 * Khách còn giữ voucher ML của chiến dịch trước (chưa hết hạn, đã dùng hay chưa) thì chưa phát tiếp,
 * để không gửi chồng và không nhiễm số đo của chiến dịch trước.
 */
export function inCooldown(expiresAt: Date | undefined, now: Date): boolean {
  return !!expiresAt && expiresAt > now;
}

/**
 * Script mô phỏng: chọn thêm khách chưa quay lại để nhóm đạt `round(rate·n)` người quay lại.
 * Đếm cả người đã quay lại (thật hoặc mô phỏng lần trước) nên chạy lại không thêm ai.
 */
export function pickSimulatedReturners<T>(users: T[], alreadyReturned: Set<T>, rate: number): T[] {
  const need = Math.round(rate * users.length) - users.filter((u) => alreadyReturned.has(u)).length;
  return need > 0 ? users.filter((u) => !alreadyReturned.has(u)).slice(0, need) : [];
}

/**
 * Tỷ lệ quay lại và chênh lệch (điểm %) giữa nhóm nhận voucher và nhóm đối chứng,
 * kèm khoảng tin cậy 95% theo Wald: (t − c) ± 1,96·√(t(1−t)/n_t + c(1−c)/n_c).
 * SE = 0 (nhóm rỗng, hoặc cả hai nhóm tỷ lệ 0/1) thì `liftCI = null`.
 */
export function compareReturn(treated: { n: number; returned: number }, control: { n: number; returned: number }) {
  const rate = (g: { n: number; returned: number }) => (g.n ? g.returned / g.n : null);
  const t = rate(treated);
  const c = rate(control);
  if (t === null || c === null) return { treatedRate: t, controlRate: c, liftPoints: null, liftCI: null, significant: false };
  const lift = (t - c) * 100;
  const se = Math.sqrt((t * (1 - t)) / treated.n + (c * (1 - c)) / control.n) * 100;
  const liftCI: [number, number] | null = se > 0 ? [lift - 1.96 * se, lift + 1.96 * se] : null;
  const significant = liftCI !== null && (liftCI[0] > 0 || liftCI[1] < 0);
  return { treatedRate: t, controlRate: c, liftPoints: lift, liftCI, significant };
}

/**
 * Tỷ lệ cứu đo được từ chiến dịch: ŝ = (r_t − r_c)/(1 − r_c), tức phần khách "sẽ rời bỏ" (1 − r_c) được voucher kéo lại.
 * Khoảng tin cậy quy từ KTC Wald của chênh lệch; kẹp [0, 1]. `significant` = cận dưới > 0 (ŝ dương có ý nghĩa).
 * Nhóm đối chứng rỗng hoặc r_c = 1 thì null.
 */
export function measuredSaveRate(treated: { n: number; returned: number }, control: { n: number; returned: number }) {
  const c = compareReturn(treated, control);
  if (c.liftPoints === null || c.controlRate === 1) return null;
  const toS = (pts: number) => Math.min(1, Math.max(0, pts / 100 / (1 - c.controlRate!)));
  return {
    s: toS(c.liftPoints),
    ci: c.liftCI ? ([toS(c.liftCI[0]), toS(c.liftCI[1])] as [number, number]) : null,
    significant: c.liftCI !== null && c.liftCI[0] > 0,
  };
}

export interface ReasonStat {
  feature: string;
  label: string;
  direction: 'UP' | 'DOWN';
  customers: number;
  /** Tỷ lệ khách trong ô có lý do này. */
  share: number;
}

export interface SegmentInsight {
  segment: ScoreSegment;
  customers: number;
  /** Số khách thuộc nhóm đối chứng (không nhận voucher). */
  controls: number;
  avgPChurn: number;
  /** Σ pChurn × clv: lợi nhuận kỳ vọng mất đi nếu không làm gì. */
  clvAtRisk: number;
  topReasons: ReasonStat[];
  /** Mức giảm gợi ý (%) cho voucher của ô; chỉ ô Giữ ngay có, các ô khác null. */
  suggestedDiscountPct: number | null;
  /** Số khách đủ điều kiện nhận voucher ở mức giảm gợi ý, kể cả nhóm đối chứng; ngoài ô Giữ ngay luôn 0. */
  eligibleCustomers: number;
}

/** Chỉ số tổng hợp theo ô (quyết định #1: không trả danh tính hay dữ liệu từng khách). */
export function summarizeScores(rows: ScoreRow[]): SegmentInsight[] {
  return SEGMENTS.map((segment) => {
    const seg = rows.filter((r) => r.segment === segment);
    const counts = new Map<string, ReasonStat>();
    for (const r of seg) {
      for (const t of r.topReasons) {
        const key = `${t.feature}|${t.direction}`;
        const cur = counts.get(key) ?? {
          feature: t.feature,
          label: FEATURE_LABEL[t.feature] ?? t.feature,
          direction: t.direction,
          customers: 0,
          share: 0,
        };
        cur.customers += 1;
        counts.set(key, cur);
      }
    }
    const n = seg.length;
    return {
      segment,
      customers: n,
      controls: seg.filter((r) => r.isControl).length,
      suggestedDiscountPct: segment === 'RETAIN' ? DEFAULT_DISCOUNT_PCT : null,
      eligibleCustomers: seg.filter((r) => eligibleForVoucher(r, DEFAULT_DISCOUNT_PCT)).length,
      avgPChurn: n ? seg.reduce((s, r) => s + r.pChurn, 0) / n : 0,
      clvAtRisk: seg.reduce((s, r) => s + r.pChurn * r.clv, 0),
      topReasons: [...counts.values()]
        .sort((a, b) => b.customers - a.customers || a.feature.localeCompare(b.feature))
        .slice(0, 3)
        .map((x) => ({ ...x, share: x.customers / n })),
    };
  });
}
