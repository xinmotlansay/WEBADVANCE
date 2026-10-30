import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { numberFromDetails, parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../core/auth/auth.service';
import { createCountdown } from '../../auth-form';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { GoogleAuthComponent } from '../../components/google-auth/google-auth.component';

@Component({
  selector: 'app-login',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink, GoogleAuthComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly lock = createCountdown();

  readonly form = this.formBuilder.group({
    // Điền sẵn khi quay về từ trang quên mật khẩu.
    identifier: [
      this.route.snapshot.queryParamMap.get('identifier') ?? '',
      [Validators.required, Validators.minLength(3)],
    ],
    password: ['', [Validators.required]],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly lockRemaining = this.lock.remaining;
  /** Đang liên kết Google: ẩn form mật khẩu chính để không có hai ô mật khẩu trên trang. */
  readonly linking = signal(false);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.errorMessage.set(null));
  }

  get identifier() {
    return this.form.controls.identifier;
  }

  get password() {
    return this.form.controls.password;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    this.auth
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.navigateAfterLogin(),
        error: (error: unknown) => {
          const parsed = parseApiError(error);

          // Khóa tạm thời đã có thông báo đếm ngược riêng, không hiện thêm alert lỗi.
          if (parsed.code === 'ACCOUNT_LOCKED') {
            const seconds = numberFromDetails(parsed, 'remainingSeconds');
            this.lock.start(Math.max(seconds ?? 60, 1));
            return;
          }

          let message = parsed.message;
          const remainingAttempts = numberFromDetails(parsed, 'remainingAttempts');
          if (parsed.code === 'INVALID_CREDENTIALS' && remainingAttempts !== null) {
            message += ` Bạn còn ${remainingAttempts} lần thử.`;
          }
          this.errorMessage.set(message);
        },
      });
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  navigateAfterLogin(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    void this.router.navigateByUrl(returnUrl);
  }
}
