import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/toast/toast.service';
import {
  STRONG_PASSWORD_VALIDATORS,
  contactError,
  createCountdown,
  formatMmSs,
  normalizeContact,
  passwordMatchValidator,
  secondsUntil,
  type Channel,
} from '../../auth-form';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { GoogleAuthComponent } from '../../components/google-auth/google-auth.component';

type Step = 'form' | 'otp';

@Component({
  selector: 'app-register',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink, GoogleAuthComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly resendCountdown = createCountdown();
  private readonly expiryCountdown = createCountdown();

  readonly form = this.formBuilder.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      dateOfBirth: [''],
      contact: ['', [Validators.required]],
      password: ['', STRONG_PASSWORD_VALIDATORS],
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
  /** Email/SĐT đã có tài khoản: hiện thêm lối tắt sang đăng nhập / quên mật khẩu. */
  readonly contactTaken = signal(false);
  readonly contactError = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly linking = signal(false);
  readonly otpSlots = [0, 1, 2, 3, 4, 5];
  readonly resendSeconds = this.resendCountdown.remaining;
  readonly otpTimeLabel = computed(() => formatMmSs(this.expiryCountdown.remaining()));
  readonly otpExpired = computed(() => this.expiryCountdown.remaining() === 0);

  private otpId = '';
  /** Liên hệ đã nhận `otpId` hiện tại; sửa thông tin khác thì không cần gửi mã mới. */
  private otpContact = '';

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
    this.setError(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const error = contactError(this.channel(), this.contact.value.trim());
    if (error) {
      this.contactError.set(error);
      return;
    }

    if (this.contactKey() === this.otpContact && !this.otpExpired()) {
      this.step.set('otp');
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
    if (this.otpForm.invalid || this.otpExpired()) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.setError(null);
    this.loading.set(true);

    const raw = this.form.getRawValue();
    const target = normalizeContact(this.channel(), raw.contact);

    this.auth
      .verifyOtp({ otpId: this.otpId, code: this.code.value })
      .pipe(
        switchMap(() =>
          this.auth.register({
            fullName: raw.fullName.trim(),
            dateOfBirth: raw.dateOfBirth || null,
            email: this.channel() === 'EMAIL' ? target : null,
            phoneNumber: this.channel() === 'PHONE' ? target : null,
            password: raw.password,
            termsAccepted: true,
            otpId: this.otpId,
          }),
        ),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => this.navigateAfterAuth(),
        error: (error: unknown) => this.setError(error),
      });
  }

  /** Giữ mã và đồng hồ: quay lại bước OTP mà không phải gửi lại nếu liên hệ không đổi. */
  backToForm(): void {
    this.setError(null);
    this.step.set('form');
    this.otpForm.reset();
  }

  navigateAfterAuth(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    void this.router.navigateByUrl(returnUrl);
  }

  private contactKey(): string {
    return `${this.channel()}:${normalizeContact(this.channel(), this.contact.value)}`;
  }

  private setError(error: unknown): void {
    const parsed = error === null ? null : parseApiError(error);
    this.errorMessage.set(parsed?.message ?? null);
    this.contactTaken.set(parsed?.code === 'EMAIL_EXISTS' || parsed?.code === 'PHONE_EXISTS');
  }

  private requestOtp(isResend: boolean): void {
    (isResend ? this.resending : this.loading).set(true);
    this.setError(null);
    const contactKey = this.contactKey();

    this.auth
      .sendOtp({
        purpose: 'REGISTER',
        channel: this.channel(),
        target: normalizeContact(this.channel(), this.contact.value),
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
          this.otpContact = contactKey;
          if (response.devCode) {
            this.toast.success(`SMS giả lập: mã xác thực của bạn là ${response.devCode}`, 8000);
          }
          this.step.set('otp');
          this.otpForm.reset();
          this.expiryCountdown.start(secondsUntil(response.expiresAt));
          this.resendCountdown.start(secondsUntil(response.resendAvailableAt, 60));
        },
        error: (error: unknown) => this.setError(error),
      });
  }
}
