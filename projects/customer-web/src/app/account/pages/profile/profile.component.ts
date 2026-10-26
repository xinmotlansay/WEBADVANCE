import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CustomerProfile } from '../../../features/account/account.service';
import { AccountReadApiService } from '../../../features/account/account-read-api.service';
import { IconComponent } from '../../../shared/icon/icon.component';

const MAX_BIRTH_DATE_EDITS = 2;
const GENDER_CODES: Record<string, string> = { Nam: 'MALE', Nữ: 'FEMALE', Khác: 'OTHER', '': '' };

@Component({
  selector: 'app-profile',
  imports: [FormsModule, IconComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent {
  protected profile: CustomerProfile = { name: '', birthday: '', gender: '', phone: '', email: '', avatar: '' };
  protected notice = '';
  protected noticeIsError = false;
  protected customerId = '';
  protected readonly profileLoaded = signal(false);
  protected readonly loadingProfile = signal(false);
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly deletingAccount = signal(false);
  protected readonly loadError = signal('');
  protected readonly maxBirthday = new Date().toISOString().slice(0, 10);
  protected accountPickerOpen = false;
  protected passwordFormOpen = false;
  protected deleteConfirmationOpen = false;
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected deletePassword = '';
  private savedBirthday = '';

  constructor(private readonly accountApi: AccountReadApiService) {
    this.customerId = accountApi.getPreviewUserId();
    if (this.customerId) this.loadProfile();
  }

  protected birthdayLocked(): boolean {
    return (this.profile.birthDateEditCount ?? 0) >= MAX_BIRTH_DATE_EDITS;
  }

  protected birthdayHint(): string {
    const remaining = MAX_BIRTH_DATE_EDITS - (this.profile.birthDateEditCount ?? 0);
    return remaining > 0
      ? `Ngày sinh chỉ được cập nhật tối đa 2 lần (còn ${remaining} lần).`
      : 'Bạn đã dùng hết 2 lần cập nhật ngày sinh.';
  }

  protected loadProfile(): void {
    const userId = this.customerId.trim();
    if (!/^[a-f\d]{24}$/i.test(userId)) {
      this.profileLoaded.set(false);
      this.loadError.set('Nhập MongoDB _id gồm 24 ký tự hexadecimal của tài khoản khách hàng.');
      return;
    }

    this.accountApi.setPreviewUserId(userId);
    this.loadingProfile.set(true);
    this.loadError.set('');
    this.accountApi.getProfile(userId).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.savedBirthday = profile.birthday;
        this.profileLoaded.set(true);
        this.accountPickerOpen = false;
        this.loadingProfile.set(false);
      },
      error: (error: unknown) => {
        this.profileLoaded.set(false);
        this.loadingProfile.set(false);
        this.loadError.set(this.apiErrorMessage(error));
      },
    });
  }

  protected saveProfile(): void {
    const fullName = this.profile.name.trim();
    const phoneNumber = this.profile.phone.replace(/[\s.-]/g, '');
    if (!fullName) return this.showNotice('Họ và tên không được để trống.', true);
    if (phoneNumber && !/^(0|84)\d{9}$/.test(phoneNumber)) {
      return this.showNotice('Số điện thoại cần 10 số, bắt đầu bằng 0.', true);
    }
    if (this.profile.birthday !== this.savedBirthday && this.savedBirthday
      && !confirm(`Ngày sinh chỉ được cập nhật tối đa 2 lần. Bạn chắc chắn đổi thành ${this.profile.birthday.split('-').reverse().join('/')}?`)) {
      return;
    }

    this.savingProfile.set(true);
    this.notice = '';
    this.accountApi.saveProfile(this.customerId, {
      fullName,
      gender: GENDER_CODES[this.profile.gender] ?? '',
      dateOfBirth: this.profile.birthday,
      phoneNumber,
    }).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.showNotice('Đã lưu thông tin cá nhân.');
        this.loadProfile();
      },
      error: (error: unknown) => {
        this.savingProfile.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected changePassword(): void {
    if ((this.profile.hasPassword && !this.currentPassword) || !this.newPassword || !this.confirmPassword) {
      return this.showNotice('Vui lòng nhập đầy đủ thông tin mật khẩu.', true);
    }
    if (this.newPassword.length < 8 || !/[A-Za-z]/.test(this.newPassword) || !/\d/.test(this.newPassword)) {
      return this.showNotice('Mật khẩu mới cần tối thiểu 8 ký tự, gồm cả chữ và số.', true);
    }
    if (this.newPassword !== this.confirmPassword) {
      return this.showNotice('Mật khẩu xác nhận chưa khớp.', true);
    }

    this.savingPassword.set(true);
    this.accountApi.changePassword(this.customerId, this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.profile.hasPassword = true;
        this.closePasswordForm();
        this.showNotice('Đã đổi mật khẩu thành công.');
      },
      error: (error: unknown) => {
        this.savingPassword.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected closePasswordForm(): void {
    this.passwordFormOpen = false;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  protected deleteAccount(): void {
    if (this.profile.hasPassword && !this.deletePassword) {
      return this.showNotice('Vui lòng nhập mật khẩu để xác nhận xoá tài khoản.', true);
    }
    this.deletingAccount.set(true);
    this.accountApi.deleteAccount(this.customerId, this.deletePassword).subscribe({
      next: () => {
        this.deletingAccount.set(false);
        this.accountApi.clearPreviewUser();
        this.customerId = '';
        this.deletePassword = '';
        this.deleteConfirmationOpen = false;
        this.profileLoaded.set(false);
        this.showNotice('Tài khoản đã được xoá. Thông tin cá nhân đã được ẩn danh hoá.');
      },
      error: (error: unknown) => {
        this.deletingAccount.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  private showNotice(message: string, isError = false): void {
    this.notice = message;
    this.noticeIsError = isError;
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy chạy server ở cổng 3002 và kiểm tra proxy.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status === 404) return 'Không tìm thấy tài khoản với MongoDB _id này.';
      if (error.status >= 500) return 'MongoDB API trả lỗi máy chủ. Hãy kiểm tra kết nối database.';
    }
    return error instanceof Error ? error.message : 'Không thực hiện được thao tác.';
  }
}
