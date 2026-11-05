import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import {
  breakEvenDiscountPct,
  compareReturn,
  DEFAULT_DISCOUNT_PCT,
  eligibleForVoucher,
  expectedCost,
  expectedNet,
  inCooldown,
  measuredSaveRate,
  pickSimulatedReturners,
  summarizeScores,
  voucherCurve,
} from './insights.rules.js';
import { segmentVoucherSchema, voucherPreviewSchema } from './insights-campaign.service.js';
import { mlAvailable, requestRescore } from './ml-client.js';

const row = (segment: string, pChurn: number, clv: number, ...feats: [string, 'UP' | 'DOWN'][]) =>
  ({ segment, pChurn, clv, topReasons: feats.map(([feature, direction]) => ({ feature, direction })) }) as never;

test('tổng hợp theo ô: số khách, pChurn TB, CLV bị đe dọa, lý do phổ biến', () => {
  const out = summarizeScores([
    row('RETAIN', 0.8, 1000, ['frequency', 'DOWN'], ['recency_days', 'UP']),
    row('RETAIN', 0.6, 500, ['frequency', 'DOWN']),
    row('LET_BE', 0.5, 100),
  ]);
  const retain = out.find((s) => s.segment === 'RETAIN')!;
  assert.equal(retain.customers, 2);
  assert.ok(Math.abs(retain.avgPChurn - 0.7) < 1e-9);
  assert.ok(Math.abs(retain.clvAtRisk - 1100) < 1e-9);
  const top = retain.topReasons[0]!;
  assert.deepEqual([top.feature, top.customers, top.share, top.label], ['frequency', 2, 1, 'Số đơn đã mua']);
  assert.equal(out.find((s) => s.segment === 'NURTURE')!.customers, 0); // ô rỗng không chia cho 0
  assert.equal(out.length, 4);
});

const reply = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });
const fails = async () => {
  throw new Error('ECONNREFUSED');
};
const codeOf = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;

test('ML không cấu hình / không chạy: báo rõ, không treo', async () => {
  assert.equal(await mlAvailable('', reply(200)), false);
  assert.equal(await mlAvailable('http://ml', fails), false);
  assert.equal(await mlAvailable('http://ml', reply(200, { ok: true })), true);
  assert.equal(await codeOf(requestRescore('', reply(200))), 'ML_UNAVAILABLE');
  assert.equal(await codeOf(requestRescore('http://ml', fails)), 'ML_UNAVAILABLE');
  assert.equal(await codeOf(requestRescore('http://ml', reply(409))), 'ML_BUSY');
  assert.equal(await codeOf(requestRescore('http://ml', reply(500))), 'ML_FAILED');
  const ok = { scored: 3, scoredAt: null, modelVersion: 'v' };
  assert.deepEqual(await requestRescore('http://ml', reply(200, ok)), ok);
});

test('chấm lại gửi X-ML-Token; ML từ chối token (401/503) thì báo lỗi cấu hình rõ ràng', async () => {
  let sent: string | null = null;
  const capture = async (_url: string | URL | Request, init?: RequestInit) => {
    sent = new Headers(init?.headers).get('X-ML-Token');
    return new Response(JSON.stringify({ scored: 0, scoredAt: null, modelVersion: 'v' }), { status: 200 });
  };
  await requestRescore('http://ml', capture as typeof fetch, 'bi-mat');
  assert.equal(sent, 'bi-mat');
  assert.equal(await codeOf(requestRescore('http://ml', reply(401), 'sai')), 'ML_AUTH');
  assert.equal(await codeOf(requestRescore('http://ml', reply(503), '')), 'ML_AUTH');
});

test('mức giảm hòa vốn: đúng công thức Neslin', () => {
  // p = 0.8, K = 1000, s = 0.3 → δ = 240 / (0.24 + 0.2) = 545.45; voucherCost = 100 (= 12% đơn) → 65.45%
  const r = { pChurn: 0.8, clv: 1000, voucherCost: 100 };
  assert.ok(Math.abs(breakEvenDiscountPct(r)! - 65.4545) < 1e-3);
  assert.equal(breakEvenDiscountPct({ ...r, voucherCost: 0 }), null);
});

test('quy tắc phát voucher: ô Giữ ngay và net > 0 tại mức giảm áp dụng', () => {
  const r = { segment: 'RETAIN' as const, pChurn: 0.8, clv: 1000, voucherCost: 100 }; // hòa vốn 65,45%
  assert.equal(eligibleForVoucher(r, 12), true);
  assert.equal(eligibleForVoucher(r, 65), true);
  assert.equal(eligibleForVoucher(r, 66), false); // vượt mức hòa vốn → net < 0
  assert.equal(eligibleForVoucher({ ...r, segment: 'NURTURE' }, 12), false); // có lãi nhưng ngoài ô Giữ ngay
  assert.equal(eligibleForVoucher({ ...r, voucherCost: 0 }, 12), false);
  // Ở 12% điều kiện trùng net > 0 của ML: net = p·s·(K − δ) − (1 − p)·δ với δ = voucherCost
  const net = (x: typeof r) => x.pChurn * 0.3 * (x.clv - x.voucherCost) - (1 - x.pChurn) * x.voucherCost;
  for (const clv of [150, 180, 200, 250, 400]) {
    const x = { ...r, pChurn: 0.7, clv };
    assert.equal(eligibleForVoucher(x, DEFAULT_DISCOUNT_PCT), net(x) > 0, `clv=${clv}`);
  }
});

test('tổng hợp ô: mức gợi ý 12% và số khách đủ điều kiện chỉ ở ô Giữ ngay', () => {
  const out = summarizeScores([
    Object.assign(row('RETAIN', 0.8, 1000), { voucherCost: 100 }), // có lãi
    Object.assign(row('RETAIN', 0.7, 150), { voucherCost: 100 }), // trong ô nhưng net < 0
    Object.assign(row('NURTURE', 0.6, 5000), { voucherCost: 100 }), // có lãi nhưng ngoài ô
  ]);
  const by = (s: string) => out.find((x) => x.segment === s)!;
  assert.deepEqual([by('RETAIN').eligibleCustomers, by('RETAIN').suggestedDiscountPct], [1, 12]);
  assert.deepEqual([by('NURTURE').eligibleCustomers, by('NURTURE').suggestedDiscountPct], [0, null]);
});

test('so sánh quay lại: chênh lệch điểm %, nhóm rỗng không chia cho 0', () => {
  const c = compareReturn({ n: 100, returned: 30 }, { n: 50, returned: 10 });
  assert.deepEqual([c.treatedRate, c.controlRate], [0.3, 0.2]);
  assert.ok(Math.abs(c.liftPoints! - 10) < 1e-9);
  assert.equal(compareReturn({ n: 0, returned: 0 }, { n: 5, returned: 1 }).liftPoints, null);
});

test('khoảng tin cậy 95% (Wald) của chênh lệch: ca tính tay và ca suy biến', () => {
  const c = compareReturn({ n: 200, returned: 60 }, { n: 200, returned: 40 });
  assert.ok(Math.abs(c.liftCI![0] - 1.57) < 0.01 && Math.abs(c.liftCI![1] - 18.43) < 0.01);
  assert.equal(c.significant, true);
  const ns = compareReturn({ n: 50, returned: 11 }, { n: 50, returned: 10 });
  assert.ok(ns.liftCI![0] < 0 && ns.liftCI![1] > 0);
  assert.equal(ns.significant, false);
  // nhóm rỗng, hoặc tỷ lệ 0/1 ở cả hai nhóm (SE = 0) → không chia cho 0
  for (const [t, k] of [
    [{ n: 0, returned: 0 }, { n: 10, returned: 3 }],
    [{ n: 10, returned: 0 }, { n: 10, returned: 0 }],
    [{ n: 10, returned: 10 }, { n: 10, returned: 0 }],
  ]) {
    const r = compareReturn(t, k);
    assert.deepEqual([r.liftCI, r.significant], [null, false]);
  }
});

test('cooldown: còn hạn voucher ML trước thì loại (kể cả đã dùng), hết hạn hoặc không có hạn thì nhận lại', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  assert.equal(inCooldown(new Date('2026-11-05T00:00:00Z'), now), true);
  assert.equal(inCooldown(now, now), false);
  assert.equal(inCooldown(new Date('2026-11-01T00:00:00Z'), now), false);
  assert.equal(inCooldown(undefined, now), false);
});

test('mô phỏng phản hồi: chỉ bù đủ tỷ lệ mục tiêu, chạy lại không thêm ai', () => {
  const users = Array.from({ length: 20 }, (_, i) => `u${i}`);
  // 20 khách, mục tiêu 35% → 7 người; đã có 2 người quay lại thật → thêm 5 người chưa quay lại.
  const picked = pickSimulatedReturners(users, new Set(['u0', 'u5']), 0.35);
  assert.equal(picked.length, 5);
  assert.ok(picked.every((u) => u !== 'u0' && u !== 'u5'));
  // Lần 2: 7 người đã quay lại → không thêm.
  assert.deepEqual(pickSimulatedReturners(users, new Set(['u0', 'u5', ...picked]), 0.35), []);
  // Đã vượt mục tiêu → không thêm (không xóa đơn thật).
  assert.deepEqual(pickSimulatedReturners(users, new Set(users), 0.1), []);
});

test('lợi nhuận kỳ vọng: Neslin tính tay, ở 12% trùng net của ML, s là tham số', () => {
  const r = { pChurn: 0.8, clv: 1000, voucherCost: 100 };
  // 12%: δ = 100 → net = 0,8·0,3·(1000 − 100) − 0,2·100 = 216 − 20 = 196; cost = 0,2·100 + 0,24·100 = 44
  assert.ok(Math.abs(expectedNet(r, 12)! - 196) < 1e-9);
  assert.ok(Math.abs(expectedCost(r, 12)! - 44) < 1e-9);
  // 24%: δ = 200, s = 0,1 → 0,08·800 − 0,2·200 = 24
  assert.ok(Math.abs(expectedNet(r, 24, 0.1)! - 24) < 1e-9);
  assert.equal(expectedNet({ ...r, voucherCost: 0 }, 12), null);
  // s nhỏ hơn → ít khách đủ điều kiện hơn; không truyền s = giả định 30%
  const x = { segment: 'RETAIN' as const, pChurn: 0.7, clv: 400, voucherCost: 100 };
  assert.equal(eligibleForVoucher(x, 12), eligibleForVoucher(x, 12, 0.3));
  assert.equal(eligibleForVoucher(x, 12, 0.3), true);
  assert.equal(eligibleForVoucher(x, 12, 0.05), false);
  // eligible ⇔ net > 0 ở mọi mức
  for (const pct of [5, 12, 20, 30]) assert.equal(eligibleForVoucher(x, pct), expectedNet(x, pct)! > 0, `pct=${pct}`);
});

test('đường cong 5–30%: số người nhận giảm dần, Σnet chỉ cộng khách có lãi', () => {
  const rows = [
    { segment: 'RETAIN' as const, pChurn: 0.8, clv: 1000, voucherCost: 100 }, // hòa vốn 65%
    { segment: 'RETAIN' as const, pChurn: 0.7, clv: 400, voucherCost: 100 }, // hòa vốn ~19%
    { segment: 'RETAIN' as const, pChurn: 0.7, clv: 400 }, // thiếu voucherCost
  ];
  const curve = voucherCurve(rows);
  assert.deepEqual([curve[0].pct, curve.at(-1)!.pct, curve.length], [5, 30, 26]);
  const at = (p: number) => curve.find((c) => c.pct === p)!;
  assert.equal(at(12).recipients, 2);
  assert.ok(Math.abs(at(12).expectedNet - (expectedNet(rows[0], 12)! + expectedNet(rows[1], 12)!)) < 1e-9);
  assert.equal(at(30).recipients, 1);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i].recipients <= curve[i - 1].recipients);
});

test('tỷ lệ cứu đo được: ŝ = (r_t − r_c)/(1 − r_c), kẹp [0, 1], kèm khoảng tin cậy', () => {
  const m = measuredSaveRate({ n: 200, returned: 70 }, { n: 200, returned: 50 })!;
  assert.ok(Math.abs(m.s - 0.1 / 0.75) < 1e-9); // ≈ 13,3%
  // KTC chênh lệch ≈ [1,2; 18,8] điểm → ŝ ∈ [1,2/75; 18,8/75]
  const [lo, hi] = m.ci!;
  assert.ok(lo > 0 && lo < m.s && hi > m.s && hi < 0.26);
  assert.equal(m.significant, true);
  const flat = measuredSaveRate({ n: 100, returned: 20 }, { n: 100, returned: 25 })!;
  assert.deepEqual([flat.s, flat.significant], [0, false]);
  assert.equal(measuredSaveRate({ n: 100, returned: 50 }, { n: 50, returned: 50 }), null); // r_c = 1
  assert.equal(measuredSaveRate({ n: 100, returned: 50 }, { n: 0, returned: 0 }), null);
});

test('schema: saveRate tùy chọn, trong (0, 1]', () => {
  const base = { discountPercent: 12, maxDiscountValue: 200_000 };
  assert.equal(segmentVoucherSchema.parse(base).saveRate, undefined);
  assert.equal(segmentVoucherSchema.parse({ ...base, saveRate: 1 }).saveRate, 1);
  for (const bad of [0, -0.1, 1.2]) assert.equal(segmentVoucherSchema.safeParse({ ...base, saveRate: bad }).success, false);
  assert.equal(voucherPreviewSchema.parse({ discountPercent: '12', saveRate: '0.13' }).saveRate, 0.13);
  assert.equal(voucherPreviewSchema.safeParse({ discountPercent: '12', saveRate: '0' }).success, false);
});
