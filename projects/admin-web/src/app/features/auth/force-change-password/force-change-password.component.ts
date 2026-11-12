import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import type { ApiResponse } from 'shared';
import { parseApiError } from '../../../core/auth/auth-error';
import { AdminAuthService } from '../../../services/auth/admin-auth.service';

const MIN_PASSWORD_LENGTH = 12;
const CHANGE_PASSWORD_API = '/api/v1/auth/change-password';

function matchPassword(group: AbstractControl): ValidationErrors | null {
  const { password, confirm } = group.value as { password: string; confirm: string };
  return confirm && password !== confirm ? { mismatch: true } : null;
}

/**
 * Admin đăng nhập bằng mật khẩu tạm (do Admin cấp cao đặt) phải đổi mật khẩu trước khi dùng các chức năng khác.
 * Server thu hồi mọi phiên sau khi đổi, nên xong thì đăng nhập lại bằng mật khẩu mới.
 */
@Component({
  selector: 'app-force-change-password',
  imports: [ReactiveFormsModule],
  templateUrl: './force-change-password.component.html',
  styleUrl: '../set-password/set-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForceChangePasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly minLength = MIN_PASSWORD_LENGTH;

  readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH), Validators.maxLength(72)]],
      confirm: ['', Validators.required],
    },
    { validators: matchPassword },
  );

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.http
      .post<ApiResponse<unknown>>(CHANGE_PASSWORD_API, { newPassword: this.form.controls.password.value }, { withCredentials: true })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.auth.clearSession();
          void this.router.navigate(['/dang-nhap'], { queryParams: { reason: 'password-changed' } });
        },
        error: (err: unknown) => this.error.set(parseApiError(err).message),
      });
  }

  logout(): void {
    this.auth.logout();
  }
}
