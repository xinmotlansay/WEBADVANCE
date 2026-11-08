import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage } from '../../../../core/api-error';
import { ConfirmService } from '../../../../services/ui/confirm.service';
import {
  AccountApiService,
  type WalkwayPassage,
  type WalkwayProfile,
  type WalkwayProfileInput,
} from '../../../../services/account/account-api.service';
import { ToastService } from '../../../../services/ui/toast.service';

interface ProfileForm {
  name: string;
  address: string;
  doorWidth: number;
  doorHeight: number;
  hallwayWidth: number;
  hasElevator: boolean;
  elevatorWidth: number;
  elevatorDepth: number;
  elevatorLoad: number;
  isDefault: boolean;
}

@Component({
  selector: 'app-home-profiles',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-profiles.component.html',
  styleUrl: './home-profiles.component.css',
})
export class HomeProfilesComponent {
  private readonly api = inject(AccountApiService);
  private readonly confirm = inject(ConfirmService);

  protected readonly profiles = signal<WalkwayProfile[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected form: ProfileForm = this.emptyProfile();

  constructor() {
    this.load();
  }

  private emptyProfile(): ProfileForm {
    return {
      name: '', address: '', doorWidth: 90, doorHeight: 210, hallwayWidth: 100,
      hasElevator: false, elevatorWidth: 140, elevatorDepth: 140, elevatorLoad: 450, isDefault: false,
    };
  }

  protected openNewProfile(): void {
    this.editingId.set('');
    this.form = this.emptyProfile();
    this.formOpen.set(true);
  }

  protected passage(profile: WalkwayProfile, type: WalkwayPassage['type']): WalkwayPassage | undefined {
    return profile.passages.find((passage) => passage.type === type);
  }

  protected editProfile(profile: WalkwayProfile): void {
    this.editingId.set(profile.id);
    const door = this.passage(profile, 'DOOR');
    const hallway = this.passage(profile, 'HALLWAY');
    const elevator = this.passage(profile, 'ELEVATOR');
    this.form = {
      name: profile.name,
      address: profile.address,
      doorWidth: door?.width ?? 90,
      doorHeight: door?.height ?? 210,
      hallwayWidth: hallway?.width ?? 100,
      hasElevator: !!elevator,
      elevatorWidth: elevator?.cabinWidth ?? 140,
      elevatorDepth: elevator?.cabinLength ?? 140,
      elevatorLoad: elevator?.loadCapacityKg ?? 450,
      isDefault: profile.isDefault,
    };
    this.formOpen.set(true);
  }

  protected saveProfile(): void {
    const form = this.form;
    if (!form.name.trim()) return this.showNotice('Vui lòng nhập tên hồ sơ.', true);
    const sizes = [form.doorWidth, form.doorHeight, form.hallwayWidth];
    if (form.hasElevator) sizes.push(form.elevatorWidth, form.elevatorDepth);
    if (sizes.some((size) => !(size >= 20 && size <= 1000))) {
      return this.showNotice('Kích thước cần từ 20 đến 1000 cm.', true);
    }
    const body: WalkwayProfileInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      isDefault: form.isDefault,
      passages: [
        { type: 'DOOR', label: 'Cửa chính', width: form.doorWidth, height: form.doorHeight },
        { type: 'HALLWAY', label: 'Hành lang', width: form.hallwayWidth },
        ...(form.hasElevator
          ? [{
              type: 'ELEVATOR' as const,
              label: 'Thang máy',
              cabinWidth: form.elevatorWidth,
              cabinLength: form.elevatorDepth,
              loadCapacityKg: form.elevatorLoad,
            }]
          : []),
      ],
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updateWalkwayProfile(id, body) : this.api.createWalkwayProfile(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.showNotice('Hồ sơ nhà đã được lưu.');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected setDefault(profile: WalkwayProfile): void {
    this.api.setDefaultWalkwayProfile(profile.id).subscribe({
      next: () => {
        this.showNotice('Đã chọn hồ sơ nhà mặc định.');
        this.load();
      },
      error: (error: unknown) => this.showNotice(apiErrorMessage(error), true),
    });
  }

  protected async deleteProfile(profile: WalkwayProfile): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Xóa hồ sơ nhà',
      message: `Bạn chắc chắn muốn xóa hồ sơ "${profile.name}"?`,
      confirmText: 'Xóa',
    });
    if (!ok) return;
    this.api.deleteWalkwayProfile(profile.id).subscribe({
      next: () => {
        this.showNotice('Hồ sơ nhà đã được xóa.');
        this.load();
      },
      error: (error: unknown) => this.showNotice(apiErrorMessage(error), true),
    });
  }

  private load(): void {
    this.api.walkwayProfiles().subscribe({
      next: (profiles) => {
        this.profiles.set(profiles);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
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
