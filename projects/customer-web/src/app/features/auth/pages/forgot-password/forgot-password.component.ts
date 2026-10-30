import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../core/auth/auth.service';
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

type Step = 'contact' | 'otp' | 'password' | 'done';

@Component({
  selector: 'app-forgot-password',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly resendCountdown = createCountdown();
  private readonly expiryCountdown = createCountdown();

  readonly contactForm = this.formBuilder.group({
    contact: ['', [Validators.required]],
  });

  readonly otpForm = this.formBuilder.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly passwordForm = this.formBuilder.group(
    {
      password: ['', STRONG_PASSWORD_VALIDATORS],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  readonly channel = signal<Channel>('EMAIL');
  readonly step = signal<Step>('contact');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly contactError = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly otpSlots = [0, 1, 2, 3, 4, 5];
  readonly resendSeconds = this.resendCountdown.remaining;
  readonly otpTimeLabel = computed(() => formatMmSs(this.expiryCountdown.remaining()));
  readonly otpExpired = computed(() => this.expiryCountdown.remaining() === 0);
  /** Giữ đích đến ban đầu (vd: checkout) khi khách quay lại đăng nhập. */
  readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');

  private otpId = '';

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

    const error = contactError(this.channel(), this.contact.value.trim());
    if (error) {
      this.contactError.set(error);
      return;
    }

    this.requestOtp();
  }

  resendOtp(): void {
    if (this.resendSeconds() > 0) {
      return;
    }
    this.requestOtp();
  }

  submitOtp(): void {
    if (this.otpForm.invalid || this.otpExpired()) {
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
          this.resendCountdown.stop();
          this.expiryCountdown.stop();
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
        error: (error: unknown) => {
          const parsed = parseApiError(error);
          if (parsed.code === 'OTP_INVALID') {
            // Phiên xác thực đã hết hạn: ở lại bước này thì không còn cách nào hoàn tất.
            this.backToContact();
            this.errorMessage.set('Phiên xác thực đã hết hạn, vui lòng gửi lại mã.');
            return;
          }
          this.errorMessage.set(parsed.message);
        },
      });
  }

  backToContact(): void {
    this.step.set('contact');
    this.errorMessage.set(null);
    this.otpForm.reset();
    this.resendCountdown.stop();
    this.expiryCountdown.stop();
  }

  private requestOtp(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth
      .sendOtp({
        purpose: 'FORGOT_PASSWORD',
        channel: this.channel(),
        target: normalizeContact(this.channel(), this.contact.value),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.otpId = response.otpId;
          this.step.set('otp');
          this.otpForm.reset();
          this.expiryCountdown.start(secondsUntil(response.expiresAt));
          this.resendCountdown.start(secondsUntil(response.resendAvailableAt, 60));
        },
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }
}
