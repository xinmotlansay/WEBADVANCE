import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize, switchMap } from 'rxjs';
import type { GoogleEmailExistsDetails } from 'shared';
import { parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../services/auth/auth.service';
import { GoogleAuthError, GoogleAuthService } from '../../../../services/auth/google-auth.service';

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
  imports: [ReactiveFormsModule],
  templateUrl: './google-auth.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleAuthComponent implements OnDestroy {
  @Input() label = 'Đăng nhập bằng Google';
  @Output() readonly authenticated = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly linkForm = this.formBuilder.group({
    password: [''],
    code: [''],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly linkState = signal<LinkState | null>(null);
  readonly linkError = signal<string | null>(null);
  readonly linkLoading = signal(false);
  readonly linkOtpSent = signal(false);
  readonly linkOtpId = signal<string | null>(null);
  readonly linkResendSeconds = signal(0);

  private linkTimer: ReturnType<typeof setInterval> | null = null;

  signIn(): void {
    if (this.loading() || this.linkState()) {
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    this.googleAuth
      .signIn()
      .then((idToken) => {
        this.auth
          .loginWithGoogle({ idToken })
          .pipe(finalize(() => this.loading.set(false)))
          .subscribe({
            next: () => this.authenticated.emit(),
            error: (error: unknown) => this.handleGoogleError(error),
          });
      })
      .catch((error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof GoogleAuthError
            ? error.message
            : 'Đăng nhập Google thất bại, vui lòng thử lại.',
        );
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
          this.linkOtpSent.set(true);
          this.linkForm.controls.code.setValue('');
          this.startLinkCountdown(response.resendAvailableAt);
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
    this.linkError.set(null);
    this.linkOtpSent.set(false);
    this.linkOtpId.set(null);
    this.linkResendSeconds.set(0);
    this.linkForm.reset();
    this.stopLinkCountdown();
  }

  ngOnDestroy(): void {
    this.stopLinkCountdown();
  }

  private handleGoogleError(error: unknown): void {
    const parsed = parseApiError(error);

    if (parsed.code === 'GOOGLE_EMAIL_EXISTS') {
      const details = parsed.details as unknown as Partial<GoogleEmailExistsDetails>;
      const methods = details.verifyMethods ?? ['PASSWORD', 'OTP_EMAIL'];

      if (!details.linkToken) {
        this.errorMessage.set(parsed.message);
        return;
      }

      this.linkForm.reset();
      this.linkError.set(null);
      this.linkOtpSent.set(false);
      this.linkOtpId.set(null);
      this.linkState.set({
        linkToken: details.linkToken,
        email: details.email ?? '',
        methods,
        mode: methods.includes('PASSWORD') ? 'password' : 'otp',
      });
      return;
    }

    this.errorMessage.set(parsed.message);
  }

  private startLinkCountdown(resendAvailableAt: string): void {
    this.stopLinkCountdown();

    const seconds = Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000);
    this.linkResendSeconds.set(Math.min(Math.max(seconds, 0), 60));

    this.linkTimer = setInterval(() => {
      this.linkResendSeconds.update((value) => {
        if (value <= 1) {
          this.stopLinkCountdown();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  private stopLinkCountdown(): void {
    if (this.linkTimer !== null) {
      clearInterval(this.linkTimer);
      this.linkTimer = null;
    }
  }
}
