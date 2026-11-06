import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../services/auth/auth.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';

type Channel = 'EMAIL' | 'PHONE';
type Step = 'contact' | 'otp' | 'password' | 'done';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-forgot-password',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);

  readonly contactForm = this.formBuilder.group({
    contact: ['', [Validators.required]],
  });

  readonly otpForm = this.formBuilder.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly passwordForm = this.formBuilder.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  readonly channel = signal<Channel>('EMAIL');
  readonly step = signal<Step>('contact');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly contactError = signal<string | null>(null);
  readonly resendSeconds = signal(0);
  readonly showPassword = signal(false);
  readonly otpSlots = [0, 1, 2, 3, 4, 5];
  readonly otpTimeRemaining = signal<number | null>(null);

  private otpId = '';
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private otpExpiryTimer: ReturnType<typeof setInterval> | null = null;

  get contact() {
    return this.contactForm.controls.contact;
  }

  get code() {
    return this.otpForm.controls.code;
  }

  get password() {
    return this.passwordForm.controls.password;
  }

  get confirmPassword() {
    return this.passwordForm.controls.confirmPassword;
  }

  otpDigit(index: number): string {
    return this.code.value[index] ?? '';
  }

  setChannel(channel: Channel): void {
    if (this.channel() === channel) {
      return;
    }
    this.channel.set(channel);
    this.contactForm.controls.contact.setValue('');
    this.contactError.set(null);
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  submitContact(): void {
    this.contactError.set(null);
    this.errorMessage.set(null);

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const target = this.contact.value.trim();
    const isValid =
      this.channel() === 'EMAIL' ? EMAIL_PATTERN.test(target) : PHONE_PATTERN.test(target);

    if (!isValid) {
      this.contactError.set(
        this.channel() === 'EMAIL'
          ? 'Email không hợp lệ.'
          : 'Số điện thoại không hợp lệ (ví dụ: 0901234567).',
      );
      return;
    }

    this.requestOtp(false);
  }

  resendOtp(): void {
    if (this.resendSeconds() > 0) {
      return;
    }
    this.requestOtp(true);
  }

  submitOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    this.auth
      .verifyOtp({ otpId: this.otpId, code: this.code.value })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.step.set('password');
          this.stopCountdown();
          this.stopOtpExpiryCountdown();
        },
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }

  submitPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    this.auth
      .resetPassword({
        otpId: this.otpId,
        newPassword: this.password.value,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.step.set('done'),
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }

  backToContact(): void {
    this.step.set('contact');
    this.errorMessage.set(null);
    this.otpForm.reset();
    this.stopCountdown();
    this.stopOtpExpiryCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    this.stopOtpExpiryCountdown();
  }

  private requestOtp(isResend: boolean): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const target = this.contact.value.trim();

    this.auth
      .sendOtp({
        purpose: 'FORGOT_PASSWORD',
        channel: this.channel(),
        target: this.channel() === 'EMAIL' ? target.toLowerCase() : target.replace(/[\s.-]/g, ''),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.otpId = response.otpId;
          this.step.set('otp');
          this.otpForm.reset();
          this.startOtpExpiryCountdown(response.expiresAt);
          this.startCountdown(response.resendAvailableAt);

          if (isResend) {
            this.errorMessage.set(null);
          }
        },
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }

  private startCountdown(resendAvailableAt: string): void {
    this.stopCountdown();

    const seconds = Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000);
    this.resendSeconds.set(Math.min(Math.max(seconds, 0), 60));

    this.countdownTimer = setInterval(() => {
      this.resendSeconds.update((value) => {
        if (value <= 1) {
          this.stopCountdown();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  private startOtpExpiryCountdown(expiresAt: string): void {
    this.stopOtpExpiryCountdown();
    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      this.otpTimeRemaining.set(null);
      return;
    }

    const updateRemaining = (): void => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      this.otpTimeRemaining.set(remaining);
      if (remaining === 0) {
        this.stopOtpExpiryCountdown();
      }
    };

    updateRemaining();
    if (this.otpTimeRemaining() !== 0) {
      this.otpExpiryTimer = setInterval(updateRemaining, 1000);
    }
  }

  otpTimeLabel(): string {
    const remaining = this.otpTimeRemaining();
    if (remaining === null) {
      return '';
    }
    return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private stopOtpExpiryCountdown(): void {
    if (this.otpExpiryTimer !== null) {
      clearInterval(this.otpExpiryTimer);
      this.otpExpiryTimer = null;
    }
  }
}
