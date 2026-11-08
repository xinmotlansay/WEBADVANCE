import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { SuperAdminApiService } from '../../../services/super-admin/super-admin-api.service';

const MIN_PASSWORD_LENGTH = 12;

function matchPassword(group: AbstractControl): ValidationErrors | null {
  const { password, confirm } = group.value as { password: string; confirm: string };
  return confirm && password !== confirm ? { mismatch: true } : null;
}

/** AD-11: Admin mới đặt mật khẩu bằng liên kết trong email (`/dat-mat-khau?token=...`). */
@Component({
  selector: 'app-set-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly token = input<string | undefined>();
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
  readonly doneEmail = signal<string | null>(null);

  submit(): void {
    const token = this.token();
    if (!token) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api
      .setPassword(token, this.form.controls.password.value)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => this.doneEmail.set(res.email),
        error: (err: unknown) => this.error.set(parseApiError(err).message),
      });
  }
}
