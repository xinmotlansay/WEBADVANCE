import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../services/auth/auth.service';
import { ToastService } from '../../../../services/ui/toast.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { GoogleAuthComponent } from '../../components/google-auth/google-auth.component';

type Channel = 'EMAIL' | 'PHONE';
type Step = 'form' | 'otp';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;

/** Khớp quy tắc của server (isStrongPassword): có chữ cái, chữ số và ký tự đặc biệt. */
function strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;
  const strong = /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
  return strong ? null : { weakPassword: true };
}

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink, GoogleAuthComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent implements OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly form = this.formBuilder.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      dateOfBirth: [''],
      contact: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8), strongPasswordValidator]],
      confirmPassword: ['', [Validators.required]],
      termsAccepted: [false, [Validators.requiredTrue]],
    },
    { validators: passwordMatchValidator },
  );

  readonly otpForm = this.formBuilder.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly channel = signal<Channel>('EMAIL');
  readonly step = signal<Step>('form');
  readonly loading = signal(false);
  readonly resending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly contactError = signal<string | null>(null);
  readonly resendSeconds = signal(0);
  readonly showPassword = signal(false);
  readonly otpSlots = [0, 1, 2, 3, 4, 5];
  readonly otpTimeRemaining = signal<number | null>(null);

  private otpId = '';
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private otpExpiryTimer: ReturnType<typeof setInterval> | null = null;

  readonly today = new Date().toISOString().slice(0, 10);

  get fullName() {
    return this.form.controls.fullName;
  }

  get contact() {
    return this.form.controls.contact;
  }

  get password() {
    return this.form.controls.password;
  }

  get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  get termsAccepted() {
    return this.form.controls.termsAccepted;
  }

  get code() {
    return this.otpForm.controls.code;
  }

  otpDigit(index: number): string {
    return this.code.value[index] ?? '';
  }

  setChannel(channel: Channel): void {
    if (this.channel() === channel) {
      return;
    }
    this.channel.set(channel);
    this.form.controls.contact.setValue('');
    this.contactError.set(null);
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  submitForm(): void {
    this.contactError.set(null);
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const target = this.form.controls.contact.value.trim();
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

    const raw = this.form.getRawValue();
    const target = raw.contact.trim();

    this.auth
      .verifyOtp({ otpId: this.otpId, code: this.otpForm.controls.code.value })
      .pipe(
        switchMap(() =>
          this.auth.register({
            fullName: raw.fullName.trim(),
            dateOfBirth: raw.dateOfBirth || null,
            email: this.channel() === 'EMAIL' ? target.toLowerCase() : null,
            phoneNumber: this.channel() === 'PHONE' ? target : null,
            password: raw.password,
            termsAccepted: true,
            otpId: this.otpId,
          }),
        ),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => this.goAfterAuth(),
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }

  backToForm(): void {
    this.errorMessage.set(null);
    this.step.set('form');
    this.otpForm.reset();
    this.stopCountdown();
    this.stopOtpExpiryCountdown();
  }

  onGoogleAuthenticated(): void {
    this.goAfterAuth();
  }

  /** Chỉ nhận đường dẫn nội bộ để tránh chuyển hướng ra ngoài. */
  private goAfterAuth(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigateByUrl(returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/');
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    this.stopOtpExpiryCountdown();
  }

  private requestOtp(isResend: boolean): void {
    if (isResend) {
      this.resending.set(true);
    } else {
      this.loading.set(true);
    }
    this.errorMessage.set(null);

    const target = this.form.controls.contact.value.trim();

    this.auth
      .sendOtp({
        purpose: 'REGISTER',
        channel: this.channel(),
        target: this.channel() === 'EMAIL' ? target.toLowerCase() : target.replace(/[\s.-]/g, ''),
      })
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.resending.set(false);
        }),
      )
      .subscribe({
        next: (response) => {
          this.otpId = response.otpId;
          if (response.devCode) {
            this.toast.success(`SMS giả lập: mã xác thực của bạn là ${response.devCode}`, 8000);
          }
          this.step.set('otp');
          this.otpForm.reset();
          this.startOtpExpiryCountdown(response.expiresAt);
          this.startCountdown(response.resendAvailableAt);
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
