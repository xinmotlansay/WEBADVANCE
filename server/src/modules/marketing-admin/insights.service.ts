import { CustomerScoreModel, ensureScoreSchema } from './customer-score.model.js';
import { summarizeScores, type ScoreRow } from './insights.rules.js';
import { mlAvailable } from './ml-client.js';

export async function getInsights() {
  await ensureScoreSchema();
  // ponytail: nạp các cột cần vào bộ nhớ rồi gộp; hàng chục nghìn khách thì chuyển sang $group.
  const rows = (await CustomerScoreModel.find({}, 'pChurn clv segment topReasons isControl voucherCost').lean()) as unknown as ScoreRow[];
  const latest = await CustomerScoreModel.findOne({}, 'scoredAt modelVersion cutoff')
    .sort({ scoredAt: -1 })
    .lean();
  const segments = summarizeScores(rows);
  return {
    hasData: rows.length > 0,
    scoredAt: latest?.scoredAt ?? null,
    cutoff: latest?.cutoff ?? null,
    modelVersion: latest?.modelVersion ?? null,
    mlAvailable: await mlAvailable(),
    totalCustomers: rows.length,
    clvAtRisk: segments.reduce((s, x) => s + x.clvAtRisk, 0),
    segments,
  };
}
