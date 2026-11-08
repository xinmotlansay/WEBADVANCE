import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { parseApiError } from '../../core/auth/auth-error';
import {
  AccountApiService,
  type WelcomeOfferResult,
  type WelcomeOfferStatus,
} from '../../services/account/account-api.service';
import { AuthService } from '../../services/auth/auth.service';

const REGISTER_LINK = { returnUrl: '/welcome-offer' };

/**
 * Trang "Ưu đãi 10% cho khách hàng mới". Khách chưa có tài khoản bấm đăng ký rồi quay lại đây;
 * đăng nhập xong thì hoàn thiện thông tin ngay trên trang, gửi email xác nhận mã NEW11.
 */
@Component({
  selector: 'app-welcome-offer',
  imports: [RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-offer.component.html',
  styleUrl: './welcome-offer.component.css',
})
export class WelcomeOfferComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AccountApiService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly registerQuery = REGISTER_LINK;
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly status = signal<WelcomeOfferStatus | null>(null);
  protected readonly result = signal<WelcomeOfferResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly today = new Date().toISOString().slice(0, 10);

  protected readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    gender: ['' as '' | 'MALE' | 'FEMALE' | 'OTHER', [Validators.required]],
    dateOfBirth: ['', [Validators.required]],
    email: [''],
    phoneNumber: [''],
    addressLine: ['', [Validators.required]],
    ward: ['', [Validators.required]],
    district: ['', [Validators.required]],
    province: ['', [Validators.required]],
  });

  private loadedFor: string | null = null;

  constructor() {
    // Đăng nhập xong (kể cả vừa đăng ký rồi quay lại) thì tải trạng thái ưu đãi và mở popup.
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.status.set(null);
        this.loadedFor = null;
        return;
      }
      if (this.loadedFor === user.id) return;
      this.loadedFor = user.id;
      this.api.welcomeOffer().subscribe({
        next: (status) => {
          this.status.set(status);
          this.prefill(status);
        },
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
    });
  }

  protected submit(): void {
    this.errorMessage.set(null);
    const status = this.status();
    const raw = this.form.getRawValue();
    const email = raw.email.trim();
    const phone = raw.phoneNumber.trim();

    if (status && !status.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.form.controls.email.markAsTouched();
      this.errorMessage.set('Nhập email hợp lệ để nhận mã giảm giá.');
      return;
    }
    if (status && !status.phoneNumber && !/^(0|\+84)\d{9}$/.test(phone)) {
      this.form.controls.phoneNumber.markAsTouched();
      this.errorMessage.set('Nhập số điện thoại hợp lệ (ví dụ: 0901234567).');
      return;
    }
    if (this.form.invalid || !raw.gender) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.api
      .claimWelcomeOffer({
        fullName: raw.fullName.trim(),
        gender: raw.gender,
        dateOfBirth: raw.dateOfBirth,
        ...(status && !status.email ? { email } : {}),
        ...(status && !status.phoneNumber ? { phoneNumber: phone } : {}),
        addressLine: raw.addressLine.trim(),
        ward: raw.ward.trim(),
        district: raw.district.trim(),
        province: raw.province.trim(),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.status.update((s) => (s ? { ...s, claimed: true } : s));
        },
        error: (error: unknown) => this.errorMessage.set(parseApiError(error).message),
      });
  }

  private prefill(status: WelcomeOfferStatus): void {
    // Tài khoản chưa có email / số điện thoại thì bắt buộc nhập.
    const { email, phoneNumber } = this.form.controls;
    if (!status.email) email.setValidators([Validators.required, Validators.email]);
    if (!status.phoneNumber) phoneNumber.setValidators([Validators.required, Validators.pattern(/^(0|\+84)\d{9}$/)]);
    email.updateValueAndValidity();
    phoneNumber.updateValueAndValidity();
    this.form.patchValue({
      fullName: status.fullName,
      gender: status.gender ?? '',
      dateOfBirth: status.dateOfBirth ?? '',
    });
  }

  protected invalid(name: keyof WelcomeOfferComponent['form']['controls']): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }
}
