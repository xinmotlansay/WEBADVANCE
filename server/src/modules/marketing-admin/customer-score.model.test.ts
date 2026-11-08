import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertScoreSchema } from './customer-score.model.js';

test('customer_scores: phiên bản khớp thì qua, lệch thì báo lỗi rõ', () => {
  assertScoreSchema([]);
  assertScoreSchema([1]);
  assert.throws(() => assertScoreSchema([1, 2]), /schemaVersion 2/);
});
