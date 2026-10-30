import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, from, switchMap } from 'rxjs';
import type { GoogleEmailExistsDetails } from 'shared';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../core/auth/auth.service';
import { GoogleAuthError, GoogleAuthService } from '../../../../core/auth/google-auth.service';
import { createCountdown, secondsUntil } from '../../auth-form';

type LinkMode = 'password' | 'otp';

interface LinkState {
  linkToken: string;
  email: string;
  methods: Array<'PASSWORD' | 'OTP_EMAIL'>;
  mode: LinkMode;
}

/**
 * Nút đăng nhập Google + luồng liên kết khi email đã có tài khoản (FR-03).
 * Dùng chung cho trang đăng nhập và đăng ký.
 */
@Component({
  selector: 'app-google-auth',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './google-auth.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleAuthComponent {
  @Input() label = 'Đăng nhập bằng Google';
  @Output() readonly authenticated = new EventEmitter<void>();
  /** Bật/tắt panel liên kết, để trang cha ẩn form mật khẩu của chính nó. */
  @Output() readonly linkingChange = new EventEmitter<boolean>();

  private readonly auth = inject(AuthService);
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly linkCountdown = createCountdown();

  readonly linkForm = this.formBuilder.group({
    password: [''],
    code: [''],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly linkState = signal<LinkState | null>(null);
  readonly linkError = signal<string | null>(null);
  readonly linkLoading = signal(false);
  readonly linkOtpId = signal<string | null>(null);
  readonly linkOtpSent = computed(() => this.linkOtpId() !== null);
  readonly linkResendSeconds = this.linkCountdown.remaining;

  signIn(): void {
    if (this.loading() || this.linkState()) {
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    from(this.googleAuth.signIn())
      .pipe(
        switchMap((idToken) => this.auth.loginWithGoogle({ idToken })),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => this.authenticated.emit(),
        // Lỗi Google không có message (vd: khách tự đóng popup) thì không báo gì.
        error: (error: unknown) =>
          error instanceof GoogleAuthError
            ? this.errorMessage.set(error.message || null)
            : this.handleGoogleError(error),
      });
  }

  setLinkMode(mode: LinkMode): void {
    const state = this.linkState();
    if (!state || state.mode === mode) {
      return;
    }
    this.linkState.set({ ...state, mode });
    this.linkError.set(null);
  }

  sendLinkOtp(): void {
    const state = this.linkState();
    if (!state || this.linkResendSeconds() > 0) {
      return;
    }

    this.linkError.set(null);
    this.linkLoading.set(true);

    this.auth
      .requestGoogleLinkOtp({ linkToken: state.linkToken })
      .pipe(finalize(() => this.linkLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.linkOtpId.set(response.otpId);
          this.linkForm.controls.code.setValue('');
          this.linkCountdown.start(secondsUntil(response.resendAvailableAt, 60));
        },
        error: (error: unknown) => this.linkError.set(parseApiError(error).message),
      });
  }

  submitLink(): void {
    const state = this.linkState();
    if (!state) {
      return;
    }

    this.linkError.set(null);

    if (state.mode === 'password') {
      const password = this.linkForm.controls.password.value;
      if (!password) {
        this.linkError.set('Vui lòng nhập mật khẩu của tài khoản CaraVeso.');
        return;
      }

      this.linkLoading.set(true);
      this.auth
        .linkGoogle({ linkToken: state.linkToken, password })
        .pipe(finalize(() => this.linkLoading.set(false)))
        .subscribe({
          next: () => this.authenticated.emit(),
          error: (error: unknown) => this.linkError.set(parseApiError(error).message),
        });
      return;
    }

    const code = this.linkForm.controls.code.value;
    const otpId = this.linkOtpId();
    if (!otpId) {
      this.linkError.set('Vui lòng gửi mã xác thực tới email trước.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      this.linkError.set('Vui lòng nhập đủ 6 chữ số của mã xác thực.');
      return;
    }

    this.linkLoading.set(true);
    this.auth
      .verifyOtp({ otpId, code })
      .pipe(
        switchMap(() => this.auth.linkGoogle({ linkToken: state.linkToken, otpId })),
        finalize(() => this.linkLoading.set(false)),
      )
      .subscribe({
        next: () => this.authenticated.emit(),
        error: (error: unknown) => this.linkError.set(parseApiError(error).message),
      });
  }

  cancelLink(): void {
    this.linkState.set(null);
    this.linkingChange.emit(false);
    this.resetLinkForm();
  }

  private resetLinkForm(): void {
    this.linkError.set(null);
    this.linkOtpId.set(null);
    this.linkForm.reset();
    this.linkCountdown.start(0);
  }

  private handleGoogleError(error: unknown): void {
    const parsed = parseApiError(error);
    const details = parsed.details as Partial<GoogleEmailExistsDetails>;

    if (parsed.code !== 'GOOGLE_EMAIL_EXISTS' || !details.linkToken) {
      this.errorMessage.set(parsed.message);
      return;
    }

    const methods = details.verifyMethods ?? ['PASSWORD', 'OTP_EMAIL'];
    this.resetLinkForm();
    this.linkState.set({
      linkToken: details.linkToken,
      email: details.email ?? '',
      methods,
      mode: methods.includes('PASSWORD') ? 'password' : 'otp',
    });
    this.linkingChange.emit(true);
  }
}
