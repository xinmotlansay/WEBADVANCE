import { describe, expect, it } from 'vitest';
import {
  canResendOtp,
  computeLockDurationSeconds,
  isStrongPassword,
  normalizeIdentifier,
} from './auth.rules.js';

describe('isStrongPassword', () => {
  it('chấp nhận mật khẩu từ 8 ký tự có chữ, số và ký tự đặc biệt', () => {
    expect(isStrongPassword('Abc@1234')).toBe(true);
  });

  it('từ chối mật khẩu ngắn hơn 8 ký tự', () => {
    expect(isStrongPassword('Ab1@')).toBe(false);
  });

  it('từ chối mật khẩu không có chữ số', () => {
    expect(isStrongPassword('Abcdef@#')).toBe(false);
  });

  it('từ chối mật khẩu không có chữ cái', () => {
    expect(isStrongPassword('12345678@')).toBe(false);
  });

  it('từ chối mật khẩu không có ký tự đặc biệt', () => {
    expect(isStrongPassword('Abc12345')).toBe(false);
  });
});

describe('computeLockDurationSeconds', () => {
  it('khóa 60 giây ở lần sai thứ 3 đầu tiên', () => {
    expect(computeLockDurationSeconds(1)).toBe(60);
  });

  it('tăng gấp đôi sau mỗi lần bị khóa tiếp theo', () => {
    expect(computeLockDurationSeconds(2)).toBe(120);
    expect(computeLockDurationSeconds(3)).toBe(240);
  });

  it('không vượt quá 15 phút', () => {
    expect(computeLockDurationSeconds(10)).toBe(900);
  });
});

describe('canResendOtp', () => {
  const now = new Date('2026-10-22T10:00:00.000Z');

  it('cho phép gửi lần đầu', () => {
    expect(
      canResendOtp({ lastSentAt: null, sentCountLastHour: 0, oldestSentAtLastHour: null, now }),
    ).toEqual({ allowed: true });
  });

  it('chặn gửi lại trong vòng 60 giây và trả thời gian chờ', () => {
    const lastSentAt = new Date('2026-10-22T09:59:30.000Z');

    expect(canResendOtp({ lastSentAt, sentCountLastHour: 1, oldestSentAtLastHour: lastSentAt, now })).toEqual({
      allowed: false,
      reason: 'OTP_RESEND_TOO_SOON',
      retryAfterSeconds: 30,
    });
  });

  it('cho phép gửi lại sau 60 giây', () => {
    const lastSentAt = new Date('2026-10-22T09:58:30.000Z');

    expect(canResendOtp({ lastSentAt, sentCountLastHour: 2, oldestSentAtLastHour: lastSentAt, now })).toEqual({
      allowed: true,
    });
  });

  it('chặn khi đã gửi 5 lần trong một giờ', () => {
    const oldestSentAtLastHour = new Date('2026-10-22T09:30:00.000Z');

    expect(
      canResendOtp({
        lastSentAt: new Date('2026-10-22T09:59:00.000Z'),
        sentCountLastHour: 5,
        oldestSentAtLastHour,
        now,
      }),
    ).toEqual({ allowed: false, reason: 'OTP_RESEND_LIMIT', retryAfterSeconds: 1800 });
  });
});

describe('normalizeIdentifier', () => {
  it('chuẩn hóa email về chữ thường và bỏ khoảng trắng', () => {
    expect(normalizeIdentifier('  User@Gmail.COM ')).toBe('user@gmail.com');
  });

  it('giữ nguyên số điện thoại', () => {
    expect(normalizeIdentifier(' 0901234567 ')).toBe('0901234567');
  });

  it('đưa số +84 về dạng 0xxxxxxxxx', () => {
    expect(normalizeIdentifier('+84901234567')).toBe('0901234567');
  });
});
