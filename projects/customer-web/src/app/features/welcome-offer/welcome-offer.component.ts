import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, startWith } from 'rxjs';
import { parseApiError } from '../../core/auth/auth-error';
import {
  AccountApiService,
  type WelcomeOfferResult,
  type WelcomeOfferStatus,
} from '../../services/account/account-api.service';
import { AuthService } from '../../services/auth/auth.service';
import {
  AddressMapPickerComponent,
  type MapPickResult,
} from '../../shared/ui/address-map-picker/address-map-picker.component';

const REGISTER_LINK = { returnUrl: '/welcome-offer' };

/** `public/data/vn-units.json`: 34 tỉnh/thành và phường/xã sau sáp nhập 2025, không còn cấp huyện. */
interface VnUnits {
  provinces: { name: string; wards: string[] }[];
}

const PHONE = /^(0|\+84)\d{9}$/;

/**
 * Trang "Ưu đãi 10% cho khách hàng mới". Khách chưa có tài khoản bấm đăng ký rồi quay lại đây;
 * đăng nhập xong thì hoàn thiện thông tin ngay trên trang, gửi email xác nhận mã NEW11.
 */
@Component({
  selector: 'app-welcome-offer',
  imports: [RouterLink, ReactiveFormsModule, AddressMapPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-offer.component.html',
  styleUrl: './welcome-offer.component.css',
})
export class WelcomeOfferComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AccountApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly http = inject(HttpClient);

  protected readonly registerQuery = REGISTER_LINK;
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly status = signal<WelcomeOfferStatus | null>(null);
  protected readonly result = signal<WelcomeOfferResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly mapOpen = signal(false);
  protected readonly units = signal<VnUnits | null>(null);

  protected readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    gender: ['' as '' | 'MALE' | 'FEMALE' | 'OTHER', [Validators.required]],
    dateOfBirth: ['', [Validators.required]],
    email: [''],
    phoneNumber: [''],
    addressLine: ['', [Validators.required]],
    ward: ['', [Validators.required]],
    province: ['', [Validators.required]],
    latitude: [null as number | null, [Validators.required]],
    longitude: [null as number | null, [Validators.required]],
  });

  private readonly provinceValue = toSignal(
    this.form.controls.province.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly wards = computed(
    () => this.units()?.provinces.find((p) => p.name === this.provinceValue())?.wards ?? [],
  );

  private loadedFor: string | null = null;

  constructor() {
    this.loadUnits();

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

  private loadUnits(): void {
    this.http
      .get<VnUnits>('/data/vn-units.json')
      .pipe(
        catchError(() => of<VnUnits>({ provinces: [] })),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.units.set(data));
  }

  protected openMap(): void {
    this.mapOpen.set(true);
  }

  protected onMapPicked(result: MapPickResult): void {
    this.mapOpen.set(false);
    this.form.patchValue({
      latitude: result.latitude,
      longitude: result.longitude,
      addressLine: result.addressLine || this.form.controls.addressLine.value || '',
    });
    if (result.province) {
      this.form.controls.province.setValue(result.province);
      this.form.controls.ward.setValue(result.ward || '');
    } else if (result.ward) {
      this.form.controls.ward.setValue(result.ward);
    }
    this.form.markAsDirty();
    this.form.updateValueAndValidity();
  }

  protected changeProvince(): void {
    this.form.controls.ward.setValue('');
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
    if (status && !status.phoneNumber && !PHONE.test(phone)) {
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
        province: raw.province.trim(),
        latitude: raw.latitude as number,
        longitude: raw.longitude as number,
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
    if (!status.phoneNumber) phoneNumber.setValidators([Validators.required, Validators.pattern(PHONE)]);
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