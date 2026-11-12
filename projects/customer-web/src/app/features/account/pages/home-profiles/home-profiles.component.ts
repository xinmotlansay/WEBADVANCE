import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WalkwayPassage as SharedPassage } from 'shared';
import { AccountIconComponent } from '../../account-icon.component';
import { PassageFormComponent } from '../../../fit-your-home/components/passage-form/passage-form.component';
import { PASSAGE_TYPE_NAMES, TYPE_ICONS, describePassage } from '../../../fit-your-home/fit-labels';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
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
  isDefault: boolean;
  passages: WalkwayPassage[];
}

@Component({
  selector: 'app-home-profiles',
  imports: [FormsModule, AccountIconComponent, IconComponent, PassageFormComponent],
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

  /** Các điểm lối đi của hồ sơ đang soạn; giống hồ sơ lối đi ở trang Fit Your Home. */
  protected readonly passages = signal<WalkwayPassage[]>([]);
  /** `null`: form điểm đóng, `-1`: thêm mới, `>= 0`: đang sửa điểm thứ i. */
  protected readonly editingPassageIndex = signal<number | null>(null);
  protected readonly editingPassage = computed(() => {
    const index = this.editingPassageIndex();
    return index !== null && index >= 0 ? (this.passages()[index] ?? null) : null;
  });

  protected readonly typeNames = PASSAGE_TYPE_NAMES;
  protected readonly typeIcons = TYPE_ICONS;
  protected readonly describePassage = describePassage;

  constructor() {
    this.load();
  }

  private emptyProfile(): ProfileForm {
    return { name: '', address: '', isDefault: false, passages: [] };
  }

  protected openNewProfile(): void {
    this.editingId.set('');
    this.form = this.emptyProfile();
    this.passages.set([]);
    this.editingPassageIndex.set(-1);
    this.formOpen.set(true);
  }

  protected editProfile(profile: WalkwayProfile): void {
    this.editingId.set(profile.id);
    this.form = {
      name: profile.name,
      address: profile.address,
      isDefault: profile.isDefault,
      passages: [],
    };
    this.passages.set(profile.passages.map((passage) => ({ ...passage })));
    this.editingPassageIndex.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingPassageIndex.set(null);
  }

  protected savePassage(passage: SharedPassage): void {
    const index = this.editingPassageIndex();
    this.passages.update((list) =>
      index !== null && index >= 0
        ? list.map((item, i) => (i === index ? passage : item))
        : [...list, passage],
    );
    this.editingPassageIndex.set(null);
  }

  protected removePassage(index: number): void {
    this.passages.update((list) => list.filter((_, i) => i !== index));
    this.editingPassageIndex.set(null);
  }

  protected saveProfile(): void {
    const form = this.form;
    if (!form.name.trim()) return this.showNotice('Vui lòng nhập tên hồ sơ.', true);
    if (this.editingPassageIndex() !== null) {
      return this.showNotice('Hãy lưu hoặc huỷ điểm lối đi đang nhập trước khi lưu hồ sơ.', true);
    }
    if (this.passages().length === 0) {
      return this.showNotice('Thêm ít nhất một điểm lối đi.', true);
    }
    const body: WalkwayProfileInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      isDefault: form.isDefault,
      passages: this.passages(),
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updateWalkwayProfile(id, body) : this.api.createWalkwayProfile(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
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
