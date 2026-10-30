export type OtpResendInput = {
  lastSentAt: Date | null;
  sentCountLastHour: number;
  oldestSentAtLastHour: Date | null;
  now?: Date;
};

export type OtpResendResult =
  | { allowed: true }
  | { allowed: false; reason: 'OTP_RESEND_TOO_SOON' | 'OTP_RESEND_LIMIT'; retryAfterSeconds: number };

export const OTP_RESEND_INTERVAL_SECONDS = 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const MAX_LOCK_DURATION_SECONDS = 15 * 60;

/** Mật khẩu khách hàng: tối thiểu 8 ký tự, có chữ, số và ký tự đặc biệt (FR-01). */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
  );
}

/** FR-02: sai 3 lần thì khóa 1 phút, các lần sau tăng dần, tối đa 15 phút. */
export function computeLockDurationSeconds(lockCount: number): number {
  const seconds = OTP_RESEND_INTERVAL_SECONDS * 2 ** Math.max(lockCount - 1, 0);
  return Math.min(seconds, MAX_LOCK_DURATION_SECONDS);
}

/** Giới hạn gửi OTP: cách nhau 60 giây, tối đa 5 lần mỗi giờ (NF-16). */
export function canResendOtp(input: OtpResendInput): OtpResendResult {
  const now = input.now ?? new Date();

  if (input.sentCountLastHour >= OTP_MAX_SENDS_PER_HOUR) {
    const oldest = input.oldestSentAtLastHour ?? input.lastSentAt;
    const retryAfterSeconds = oldest
      ? Math.max(1, Math.ceil((oldest.getTime() + 3_600_000 - now.getTime()) / 1000))
      : 3_600;
    return { allowed: false, reason: 'OTP_RESEND_LIMIT', retryAfterSeconds };
  }

  if (input.lastSentAt) {
    const elapsedSeconds = (now.getTime() - input.lastSentAt.getTime()) / 1000;
    if (elapsedSeconds < OTP_RESEND_INTERVAL_SECONDS) {
      return {
        allowed: false,
        reason: 'OTP_RESEND_TOO_SOON',
        retryAfterSeconds: Math.max(1, Math.ceil(OTP_RESEND_INTERVAL_SECONDS - elapsedSeconds)),
      };
    }
  }

  return { allowed: true };
}

/** SĐT về một dạng duy nhất `0xxxxxxxxx` để `+84901…` và `0901…` là cùng một tài khoản. */
export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s.-]/g, '');
  return compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
}

export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : normalizePhone(trimmed);
}
