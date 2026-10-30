import { Schema, model } from 'mongoose';

interface IRateCounter {
  _id: string;
  count: number;
  expiresAt: Date;
}

const rateCounterSchema = new Schema<IRateCounter>({
  _id: { type: String },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});

// TTL dọn trễ tới ~60 giây; `hitRateCounter` tự coi cửa sổ đã hết hạn là cửa sổ mới.
rateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateCounterModel = model<IRateCounter>('RateCounter', rateCounterSchema);

export interface RateCounterHit {
  count: number;
  retryAfterSeconds: number;
}

/**
 * Tăng bộ đếm `key` trong cửa sổ cố định `windowSeconds` (NF-16). Một lệnh nguyên tử: còn hạn thì
 * +1, chưa có hoặc đã hết hạn thì bắt đầu lại từ 1 với hạn mới.
 */
export async function hitRateCounter(key: string, windowSeconds: number): Promise<RateCounterHit> {
  const now = new Date();
  const alive = { $gt: ['$expiresAt', now] };
  const counter = await RateCounterModel.findOneAndUpdate(
    { _id: key },
    [
      {
        $set: {
          count: { $cond: [alive, { $add: ['$count', 1] }, 1] },
          expiresAt: {
            $cond: [alive, '$expiresAt', new Date(now.getTime() + windowSeconds * 1000)],
          },
        },
      },
    ],
    { upsert: true, returnDocument: 'after', updatePipeline: true, lean: true },
  ).orFail(); // upsert luôn trả bản ghi; orFail chỉ để kiểu không còn null.

  return {
    count: counter.count,
    retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1000)),
  };
}
