import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerProfile } from '../../../features/account/account.service';
import { AccountReadApiService } from '../../../features/account/account-read-api.service';

@Component({
  selector: 'app-profile',
  imports: [FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent {
  protected profile: CustomerProfile = { name: '', birthday: '', gender: '', phone: '', email: '', avatar: '' };
  protected notice = '';
  protected customerId = '';
  protected readonly profileLoaded = signal(false);
  protected readonly loadingProfile = signal(false);
  protected readonly loadError = signal('');
  protected accountPickerOpen = true;
  protected passwordFormOpen = false;
  protected deleteConfirmationOpen = false;
  protected avatarPreview = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';

  constructor(
    private readonly accountApi: AccountReadApiService,
  ) {
    this.customerId = accountApi.getPreviewUserId();
    if (this.customerId) this.loadProfile();
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
        this.avatarPreview = profile.avatar;
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

  protected toggleAccountPicker(): void {
    this.accountPickerOpen = !this.accountPickerOpen;
  }

  protected saveProfile(): void {
    this.notice = 'Demo chỉ đọc: thông tin cá nhân chưa được lưu vào MongoDB.';
  }

  protected changePassword(): void {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.notice = 'Vui lòng nhập đầy đủ thông tin mật khẩu.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.notice = 'Mật khẩu mới cần có ít nhất 8 ký tự.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.notice = 'Mật khẩu xác nhận chưa khớp.';
      return;
    }
    this.passwordFormOpen = false;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.notice = 'Đổi mật khẩu cần API xác thực; thao tác này chưa được lưu vào MongoDB.';
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy chạy server ở cổng 3002 và kiểm tra proxy.';
      if (error.status === 400) return 'MongoDB _id không hợp lệ.';
      if (error.status === 404) return 'Không tìm thấy tài khoản với MongoDB _id này.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status >= 500) return 'MongoDB API trả lỗi máy chủ. Hãy kiểm tra kết nối database và cấu hình collection users.';
    }
    return error instanceof Error ? error.message : 'Không tải được hồ sơ tài khoản.';
  }
}
