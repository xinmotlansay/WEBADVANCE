import { Schema, model, type Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';

/** Phiên bản hợp đồng `customer_scores` mà Web hiểu (tasks/marketing-admin-plan.md, "Hợp đồng dữ liệu ML ↔ Web"). */
export const SCORE_SCHEMA_VERSION = 1;

export type ScoreSegment = 'RETAIN' | 'NURTURE' | 'NO_SPEND' | 'LET_BE';

export interface CustomerScoreDoc {
  customerId: Types.ObjectId;
  pChurn: number;
  clv: number;
  segment: ScoreSegment;
  topReasons: { feature: string; direction: 'UP' | 'DOWN' }[];
  net: number;
  /** null = không có tỷ lệ cứu nào hòa vốn (CLV không vượt chi phí voucher). */
  sStar: number | null;
  voucherCost: number;
  isControl: boolean;
  scoredAt: Date;
  cutoff: Date;
  modelVersion: string;
  schemaVersion: number;
}

/** ML ghi collection này; Web chỉ đọc (và seed bản demo). */
const scoreSchema = new Schema<CustomerScoreDoc>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
    pChurn: { type: Number, required: true, min: 0, max: 1 },
    clv: { type: Number, required: true },
    segment: { type: String, required: true, enum: ['RETAIN', 'NURTURE', 'NO_SPEND', 'LET_BE'] },
    topReasons: [{ _id: false, feature: String, direction: { type: String, enum: ['UP', 'DOWN'] } }],
    net: { type: Number, required: true },
    sStar: { type: Number, default: null },
    voucherCost: { type: Number, required: true },
    isControl: { type: Boolean, required: true },
    scoredAt: { type: Date, required: true },
    cutoff: { type: Date, required: true },
    modelVersion: { type: String, required: true },
    schemaVersion: { type: Number, required: true },
  },
  { collection: 'customer_scores' },
);
scoreSchema.index({ segment: 1, isControl: 1 });

export const CustomerScoreModel = model<CustomerScoreDoc>('customer_scores', scoreSchema);

/** Lệch phiên bản thì báo lỗi rõ, không hiển thị số có thể sai nghĩa. */
export function assertScoreSchema(versions: number[]): void {
  const bad = versions.filter((v) => v !== SCORE_SCHEMA_VERSION);
  if (bad.length) {
    throw new AppError(
      'ML_SCHEMA_MISMATCH',
      500,
      `customer_scores có schemaVersion ${bad.join(', ')}, Web chỉ hỗ trợ ${SCORE_SCHEMA_VERSION}. Cần cập nhật Web hoặc chấm lại bằng bản ML tương thích.`,
    );
  }
}

/** Mọi chỗ đọc điểm khách (M8) gọi hàm này trước khi tổng hợp. */
export async function ensureScoreSchema(): Promise<void> {
  assertScoreSchema((await CustomerScoreModel.distinct('schemaVersion')) as number[]);
}
