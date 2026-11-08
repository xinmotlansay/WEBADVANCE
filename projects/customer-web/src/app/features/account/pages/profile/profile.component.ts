import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { map, of, switchMap, type Observable } from 'rxjs';
import { apiErrorMessage } from '../../../../core/api-error';
import { AuthService } from '../../../../services/auth/auth.service';
import { ConfirmService } from '../../../../services/ui/confirm.service';
import { AccountApiService, type AccountProfile, type Gender } from '../../../../services/account/account-api.service';

type ContactChannel = 'EMAIL' | 'PHONE';
interface ContactEdit {
  channel: ContactChannel;
  target: string;
  otpId: string;
  code: string;
  verified: boolean;
}
import { AccountIconComponent } from '../../account-icon.component';
import { ToastService } from '../../../../services/ui/toast.service';

const MAX_BIRTH_DATE_EDITS = 2;

@Component({
  selector: 'app-profile',
  imports: [FormsModule, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent {
  private readonly api = inject(AccountApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);

  protected readonly profile = signal<AccountProfile | null>(null);
  protected readonly loadError = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly deletingAccount = signal(false);
  protected readonly passwordFormOpen = signal(false);
  protected readonly deleteConfirmationOpen = signal(false);
  /** Đang đổi email/SĐT bằng OTP (API Design 2.2). */
  protected readonly contactEdit = signal<ContactEdit | null>(null);
  protected readonly otpBusy = signal(false);
  /** Mã OTP xác nhận xóa tài khoản cho tài khoản chưa có mật khẩu. */
  protected readonly deleteOtpId = signal('');
  protected deleteCode = '';
  protected readonly maxBirthday = new Date().toISOString().slice(0, 10);

  // Dữ liệu các ô nhập (form kiểu template-driven).
  protected name = '';
  protected birthday = '';
  protected gender: Gender | '' = '';
  protected phone = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected deletePassword = '';

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.profile().subscribe({
      next: (profile) => this.apply(profile),
      error: (error: unknown) => this.loadError.set(apiErrorMessage(error)),
    });
  }

  private apply(profile: AccountProfile): void {
    this.profile.set(profile);
    this.name = profile.fullName;
    this.birthday = profile.dateOfBirth ?? '';
    this.gender = profile.gender ?? '';
    this.phone = profile.phoneNumber ?? '';
  }

  protected birthdayLocked(): boolean {
    return (this.profile()?.birthDateEditCount ?? 0) >= MAX_BIRTH_DATE_EDITS;
  }

  protected birthdayHint(): string {
    const remaining = MAX_BIRTH_DATE_EDITS - (this.profile()?.birthDateEditCount ?? 0);
    return remaining > 0
      ? `Ngày sinh chỉ được cập nhật tối đa 2 lần (còn ${remaining} lần).`
      : 'Bạn đã dùng hết 2 lần cập nhật ngày sinh.';
  }

  protected async saveProfile(): Promise<void> {
    const current = this.profile();
    if (!current) return;
    const fullName = this.name.trim();
    if (!fullName) return this.showNotice('Họ và tên không được để trống.', true);
    const birthdayChanged = this.birthday !== (current.dateOfBirth ?? '');
    if (birthdayChanged && current.dateOfBirth) {
      const ok = await this.confirm.ask({
        title: 'Đổi ngày sinh',
        message: `Ngày sinh chỉ được cập nhật tối đa 2 lần. Bạn chắc chắn đổi thành ${this.birthday.split('-').reverse().join('/')}?`,
        confirmText: 'Đổi ngày sinh',
      });
      if (!ok) return;
    }

    this.savingProfile.set(true);
    this.notice.set(null);
    this.api
      .updateProfile({
        fullName,
        gender: this.gender || null,
        dateOfBirth: this.birthday || null,
      })
      .subscribe({
        next: (profile) => {
          this.savingProfile.set(false);
          this.apply(profile);
          this.auth.loadMe().subscribe();
          this.showNotice('Đã lưu thông tin cá nhân.');
        },
        error: (error: unknown) => {
          this.savingProfile.set(false);
          this.showNotice(apiErrorMessage(error), true);
        },
      });
  }

  protected changePassword(): void {
    const hasPassword = this.profile()?.hasPassword;
    if ((hasPassword && !this.currentPassword) || !this.newPassword || !this.confirmPassword) {
      return this.showNotice('Vui lòng nhập đầy đủ thông tin mật khẩu.', true);
    }
    if (this.newPassword.length < 8 || !/[A-Za-z]/.test(this.newPassword) || !/\d/.test(this.newPassword) || !/[^A-Za-z\d]/.test(this.newPassword)) {
      return this.showNotice('Mật khẩu mới cần tối thiểu 8 ký tự, gồm chữ, số và ký tự đặc biệt.', true);
    }
    if (this.newPassword !== this.confirmPassword) {
      return this.showNotice('Mật khẩu xác nhận chưa khớp.', true);
    }

    this.savingPassword.set(true);
    this.api.changePassword(this.newPassword, this.currentPassword || undefined).subscribe({
      next: () => {
        this.savingPassword.set(false);
        // Server thu hồi mọi phiên khi đổi mật khẩu, nên khách đăng nhập lại bằng mật khẩu mới.
        this.auth.clearSession();
        void this.router.navigate(['/auth/login']);
      },
      error: (error: unknown) => {
        this.savingPassword.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected closePasswordForm(): void {
    this.passwordFormOpen.set(false);
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  /** Tài khoản chưa có mật khẩu: gửi mã xác nhận tới email (hoặc SĐT) hiện có. */
  protected sendDeleteOtp(): void {
    const profile = this.profile();
    if (!profile) return;
    const channel: ContactChannel = profile.email ? 'EMAIL' : 'PHONE';
    const target = profile.email ?? profile.phoneNumber;
    if (!target) return this.showNotice('Tài khoản chưa có email hoặc số điện thoại để nhận mã.', true);
    this.otpBusy.set(true);
    this.auth.sendOtp({ purpose: 'DELETE_ACCOUNT', channel, target }).subscribe({
      next: (result) => {
        this.otpBusy.set(false);
        this.deleteOtpId.set(result.otpId);
        this.showNotice(`Đã gửi mã xác nhận tới ${target}.`);
      },
      error: (error: unknown) => {
        this.otpBusy.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected deleteAccount(): void {
    const hasPassword = this.profile()?.hasPassword;
    if (hasPassword && !this.deletePassword) {
      return this.showNotice('Vui lòng nhập mật khẩu để xác nhận xoá tài khoản.', true);
    }
    if (!hasPassword && !(this.deleteOtpId() && /^\d{6}$/.test(this.deleteCode))) {
      return this.showNotice('Vui lòng nhập mã xác nhận 6 chữ số đã gửi tới bạn.', true);
    }
    this.deletingAccount.set(true);
    const confirm$: Observable<{ password?: string; otpId?: string }> = hasPassword
      ? of({ password: this.deletePassword })
      : this.auth.verifyOtp({ otpId: this.deleteOtpId(), code: this.deleteCode }).pipe(map(() => ({ otpId: this.deleteOtpId() })));
    confirm$.pipe(switchMap((proof) => this.api.deleteAccount(proof))).subscribe({
      next: () => {
        this.auth.clearSession();
        void this.router.navigate(['/']);
      },
      error: (error: unknown) => {
        this.deletingAccount.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected cancelDelete(): void {
    this.deleteConfirmationOpen.set(false);
    this.deletePassword = '';
    this.deleteOtpId.set('');
    this.deleteCode = '';
  }

  protected startContactEdit(channel: ContactChannel): void {
    this.contactEdit.set({ channel, target: '', otpId: '', code: '', verified: false });
    this.notice.set(null);
  }

  protected cancelContactEdit(): void {
    this.contactEdit.set(null);
  }

  protected sendContactOtp(): void {
    const edit = this.contactEdit();
    if (!edit) return;
    const target = edit.target.trim();
    const valid = edit.channel === 'EMAIL' ? /^\S+@\S+\.\S+$/.test(target) : /^(0|\+84)\d{9}$/.test(target.replace(/[\s.-]/g, ''));
    if (!valid) {
      return this.showNotice(edit.channel === 'EMAIL' ? 'Email không hợp lệ.' : 'Số điện thoại cần 10 số, bắt đầu bằng 0.', true);
    }
    this.otpBusy.set(true);
    this.auth.sendOtp({ purpose: 'CHANGE_CONTACT', channel: edit.channel, target }).subscribe({
      next: (result) => {
        this.otpBusy.set(false);
        this.contactEdit.set({ ...edit, target, otpId: result.otpId });
        this.showNotice(`Đã gửi mã xác nhận tới ${target}.`);
      },
      error: (error: unknown) => {
        this.otpBusy.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected confirmContact(): void {
    const edit = this.contactEdit();
    if (!edit?.otpId || !/^\d{6}$/.test(edit.code)) {
      return this.showNotice('Vui lòng nhập mã xác nhận 6 chữ số.', true);
    }
    this.otpBusy.set(true);
    this.auth
      .verifyOtp({ otpId: edit.otpId, code: edit.code })
      .pipe(switchMap(() => this.api.changeContact({ channel: edit.channel, target: edit.target, otpId: edit.otpId })))
      .subscribe({
        next: (profile) => {
          this.otpBusy.set(false);
          this.contactEdit.set(null);
          this.apply(profile);
          this.auth.loadMe().subscribe();
          this.showNotice('Đã cập nhật thông tin liên hệ.');
        },
        error: (error: unknown) => {
          this.otpBusy.set(false);
          this.showNotice(apiErrorMessage(error), true);
        },
      });
  }

  private readonly toast = inject(ToastService);

  /** Thành công hiện toast ở đầu trang rồi tự mất; lỗi vẫn giữ lại trên trang. */
  private showNotice(text: string, error = false): void {
    if (error) {
      this.notice.set({ text, error });
      return;
    }
    this.notice.set(null);
    this.toast.success(text);
  }
}
