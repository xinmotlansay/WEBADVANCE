import { DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

export type Channel = 'EMAIL' | 'PHONE';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^(0|\+84)\d{9}$/;

/** Khớp `isStrongPassword` ở server: 8–72 ký tự, có chữ, số và ký tự đặc biệt. */
export const STRONG_PASSWORD_VALIDATORS: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(8),
  Validators.maxLength(72),
  Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/),
];

export function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

/** Lỗi định dạng email/SĐT theo kênh đang chọn, `null` nếu hợp lệ. */
export function contactError(channel: Channel, target: string): string | null {
  if (channel === 'EMAIL') {
    return EMAIL_PATTERN.test(target) ? null : 'Email không hợp lệ.';
  }
  return PHONE_PATTERN.test(target) ? null : 'Số điện thoại không hợp lệ (ví dụ: 0901234567).';
}

export function normalizeContact(channel: Channel, target: string): string {
  const trimmed = target.trim();
  return channel === 'EMAIL' ? trimmed.toLowerCase() : trimmed.replace(/[\s.-]/g, '');
}

/** Số giây còn lại tới một mốc ISO, chặn trong [0, max]. */
export function secondsUntil(iso: string, max = Number.POSITIVE_INFINITY): number {
  const seconds = Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), max) : 0;
}

export function formatMmSs(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Đồng hồ đếm ngược theo mốc thời gian thực (không lệch khi tab bị trình duyệt làm chậm),
 * tự dừng khi component bị hủy. Gọi trong injection context (khai báo field).
 */
export function createCountdown() {
  const remaining = signal(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = (seconds: number): void => {
    stop();
    const endsAt = Date.now() + seconds * 1000;
    const tick = (): void => {
      remaining.set(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
      if (remaining() === 0) stop();
    };
    tick();
    if (remaining() > 0) timer = setInterval(tick, 1000);
  };

  inject(DestroyRef).onDestroy(stop);
  return { remaining: remaining.asReadonly(), start, stop };
}
