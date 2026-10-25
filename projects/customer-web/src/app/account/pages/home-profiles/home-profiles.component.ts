import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountService, HomeProfile } from '../../../features/account/account.service';

@Component({
  selector: 'app-home-profiles',
  imports: [FormsModule],
  templateUrl: './home-profiles.component.html',
  styleUrl: './home-profiles.component.css',
})
export class HomeProfilesComponent {
  protected readonly profiles;
  protected formOpen = false;
  protected editingId?: number;
  protected notice = '';
  protected form: Omit<HomeProfile, 'id'> = this.emptyProfile();

  constructor(private readonly account: AccountService) {
    this.profiles = account.homeProfiles;
  }

  private emptyProfile(): Omit<HomeProfile, 'id'> {
    return { name: '', address: '', doorWidth: 90, doorHeight: 210, hallwayWidth: 100, elevatorWidth: 140, elevatorDepth: 140, elevatorLoad: 450, isDefault: false };
  }

  protected openNewProfile(): void {
    this.editingId = undefined;
    this.form = this.emptyProfile();
    this.formOpen = true;
  }

  protected editProfile(profile: HomeProfile): void {
    this.editingId = profile.id;
    this.form = { ...profile };
    this.formOpen = true;
  }

  protected saveProfile(): void {
    if (!this.form.name.trim() || !this.form.address.trim()) {
      this.notice = 'Vui lòng nhập tên hồ sơ và địa chỉ nhà.';
      return;
    }
    this.account.saveHomeProfile(this.form, this.editingId);
    this.formOpen = false;
    this.notice = 'Hồ sơ nhà đã được lưu.';
  }

  protected setDefault(profile: HomeProfile): void {
    this.account.setDefaultHomeProfile(profile.id);
    this.notice = 'Đã chọn hồ sơ nhà mặc định.';
  }

  protected deleteProfile(profile: HomeProfile): void {
    if (profile.isDefault) {
      this.notice = 'Hãy đặt hồ sơ nhà khác làm mặc định trước khi xóa hồ sơ này.';
      return;
    }
    this.account.removeHomeProfile(profile.id);
    this.notice = 'Hồ sơ nhà đã được xóa.';
  }
}
