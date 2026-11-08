import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { numberFromDetails, parseApiError } from '../../../../core/auth/auth-error';
import { AuthService } from '../../../../services/auth/auth.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { GoogleAuthComponent } from '../../components/google-auth/google-auth.component';

@Component({
  selector: 'app-login',
  imports: [AuthLayoutComponent, ReactiveFormsModule, RouterLink, GoogleAuthComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnDestroy {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.formBuilder.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required]],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly lockRemaining = signal(0);

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

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
          let message = parsed.message;

          const remainingAttempts = numberFromDetails(parsed, 'remainingAttempts');
          if (parsed.code === 'INVALID_CREDENTIALS' && remainingAttempts !== null) {
            message += ` Bạn còn ${remainingAttempts} lần thử.`;
          }

          this.errorMessage.set(message);

          if (parsed.code === 'ACCOUNT_LOCKED') {
            const seconds = numberFromDetails(parsed, 'remainingSeconds');
            this.startLockCountdown(seconds ?? 60);
          }
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

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  private startLockCountdown(seconds: number): void {
    this.stopCountdown();
    this.lockRemaining.set(Math.max(seconds, 1));

    this.countdownTimer = setInterval(() => {
      this.lockRemaining.update((value) => {
        if (value <= 1) {
          this.stopCountdown();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
