import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAdminChangeAllowed } from '../src/modules/super-admin/admin-account.rules.js';
import { redactForAudit } from '../src/modules/super-admin/audit-log.service.js';
import { percentChange, resolveRange, vnStartOfDay, vnStartOfMonth } from '../src/modules/super-admin/dashboard.service.js';
import { CONFIG_BY_KEY } from '../src/modules/super-admin/system-config.registry.js';
import { AppError } from '../src/utils/app-error.js';

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : 'UNKNOWN';
  }
};

test('AD-12: không tự vô hiệu hóa, không vô hiệu hóa Admin cấp cao cuối cùng', () => {
  const base = { actorId: 'a', targetId: 'b', targetIsActiveSuperAdmin: true, activeSuperAdminCount: 2 };
  assert.equal(code(() => assertAdminChangeAllowed('DEACTIVATE', { ...base, targetId: 'a' })), 'SELF_ACTION_FORBIDDEN');
  assert.equal(code(() => assertAdminChangeAllowed('DEACTIVATE', { ...base, activeSuperAdminCount: 1 })), 'LAST_SUPER_ADMIN');
  assert.equal(code(() => assertAdminChangeAllowed('DEACTIVATE', base)), null);
  assert.equal(
    code(() => assertAdminChangeAllowed('DEACTIVATE', { ...base, targetIsActiveSuperAdmin: false, activeSuperAdminCount: 1 })),
    null,
  );
});

test('AD-13: không tự đổi vai trò, không hạ vai trò Admin cấp cao cuối cùng', () => {
  const base = { actorId: 'a', targetId: 'b', targetIsActiveSuperAdmin: true, activeSuperAdminCount: 1 };
  assert.equal(code(() => assertAdminChangeAllowed('CHANGE_ROLE', { ...base, targetId: 'a' })), 'SELF_ACTION_FORBIDDEN');
  assert.equal(code(() => assertAdminChangeAllowed('CHANGE_ROLE', base)), 'LAST_SUPER_ADMIN');
  assert.equal(code(() => assertAdminChangeAllowed('CHANGE_ROLE', { ...base, keepsSuperAdmin: true })), null);
});

test('NF-A04: nhật ký không chứa mật khẩu, số tài khoản chỉ còn 4 số cuối', () => {
  const out = redactForAudit({ password: 'x', nested: { accountNumber: '0123456789', bankName: 'VCB' } });
  assert.deepEqual(out, { nested: { accountNumber: '******6789', bankName: 'VCB' } });
});

test('AD-02: mốc ngày/tháng theo giờ Việt Nam và kỳ so sánh cùng độ dài', () => {
  const at = new Date('2026-10-29T18:30:00Z'); // 01:30 ngày 30/10 giờ VN
  assert.equal(vnStartOfDay(at).toISOString(), '2026-10-29T17:00:00.000Z');
  assert.equal(vnStartOfMonth(at).toISOString(), '2026-09-30T17:00:00.000Z');
  const r = resolveRange('7d', at);
  assert.equal(r.end.getTime() - r.start.getTime(), 7 * 86_400_000);
  assert.equal(r.prevEnd.getTime(), r.start.getTime());
  assert.equal(percentChange(112, 100), 12);
  assert.equal(percentChange(5, 0), null);
});

test('AD-15: kiểm tra kiểu giá trị theo khóa cấu hình', () => {
  const returnDays = CONFIG_BY_KEY.get('policy.returnDays')!;
  assert.ok(returnDays.schema.safeParse(7).success);
  assert.ok(!returnDays.schema.safeParse(0).success);
  assert.ok(!returnDays.schema.safeParse('7').success);
  const payment = CONFIG_BY_KEY.get('payment')!;
  assert.ok(payment.schema.safeParse(payment.defaultValue).success);
  assert.ok(!payment.schema.safeParse({ ...(payment.defaultValue as object), depositRate: 1.5 }).success);
  const shipping = CONFIG_BY_KEY.get('shipping')!;
  assert.ok(shipping.schema.safeParse(shipping.defaultValue).success);
  // Số tài khoản mặc định để trống: Admin bắt buộc nhập số thật mới lưu được.
  assert.ok(!CONFIG_BY_KEY.get('payment.bankAccount')!.schema.safeParse(CONFIG_BY_KEY.get('payment.bankAccount')!.defaultValue).success);
  for (const def of [...CONFIG_BY_KEY.values()].filter((d) => d.key !== 'payment.bankAccount')) {
    assert.ok(def.schema.safeParse(def.defaultValue).success, `Mặc định của ${def.key} phải hợp lệ`);
  }
});
