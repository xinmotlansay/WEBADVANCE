import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminAuthService, AdminAuthError } from '../../../core/auth/admin-auth.service';
import { numberFromDetails, parseApiError } from '../../../core/auth/auth-error';

const MIN_PASSWORD_LENGTH = 12;

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLoginComponent implements OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  /** Trang đang làm dở trước khi bị đưa về đăng nhập (query `returnUrl`). */
  readonly returnUrl = input<string | undefined>();
  /** `expired=1` khi phiên hết hạn do không thao tác. */
  readonly expired = input<string | undefined>();

  readonly form = this.formBuilder.group({
    identifier: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Số giây còn lại của lần khóa đăng nhập; > 0 thì khóa nút đăng nhập. */
  readonly lockSeconds = signal(0);

  private lockTimer: ReturnType<typeof setInterval> | null = null;

  get identifier() {
    return this.form.controls.identifier;
  }

  get password() {
    return this.form.controls.password;
  }

  lockLabel(): string {
    const seconds = this.lockSeconds();
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  submit(): void {
    this.errorMessage.set(null);

    if (this.lockSeconds() > 0) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { identifier, password } = this.form.getRawValue();

    this.auth
      .login({ identifier: identifier.trim().toLowerCase(), password })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
        error: (error: unknown) => this.handleError(error),
      });
  }

  ngOnDestroy(): void {
    this.stopLockTimer();
  }

  /** Chỉ quay lại đường dẫn nội bộ của trang admin, không theo URL ngoài. */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/admin/login')
      ? url
      : '/admin/dashboard';
  }

  private handleError(error: unknown): void {
    // Lỗi do service tự ném (ví dụ: tài khoản không phải admin) — không phải HttpErrorResponse.
    if (error instanceof AdminAuthError) {
      this.errorMessage.set(error.message);
      return;
    }

    const parsed = parseApiError(error);

    if (parsed.code === 'ACCOUNT_LOCKED') {
      const seconds = numberFromDetails(parsed, 'remainingSeconds') ?? 60;
      this.startLock(seconds);
      return;
    }

    if (parsed.code === 'INVALID_CREDENTIALS') {
      const remaining = numberFromDetails(parsed, 'remainingAttempts');
      this.errorMessage.set(
        remaining === null
          ? 'Email hoặc mật khẩu không đúng. Kiểm tra lại và thử lại.'
          : `Email hoặc mật khẩu không đúng. Bạn còn ${remaining} lần thử trước khi bị khóa tạm thời.`,
      );
      return;
    }

    this.errorMessage.set(parsed.message);
  }

  private startLock(seconds: number): void {
    this.stopLockTimer();
    this.lockSeconds.set(seconds);
    this.lockTimer = setInterval(() => {
      this.lockSeconds.update((value) => {
        if (value <= 1) {
          this.stopLockTimer();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  private stopLockTimer(): void {
    if (this.lockTimer !== null) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
  }
}
