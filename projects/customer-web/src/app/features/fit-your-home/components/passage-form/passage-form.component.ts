import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { PassageType, WalkwayPassage } from 'shared';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { PASSAGE_TYPE_NAMES, TYPE_ICONS } from '../../fit-labels';

const CM = [Validators.required, Validators.min(20), Validators.max(1000)];
const CABIN_FIELDS = ['cabinWidth', 'cabinLength', 'cabinHeight', 'loadCapacityKg'] as const;

/** Nhãn hai số đo chính theo loại lối đi. */
const OPENING_LABELS: Record<PassageType, [string, string]> = {
  DOOR: ['Cửa rộng', 'Cửa cao'],
  ELEVATOR: ['Cửa rộng', 'Cửa cao'],
  STAIRS: ['Lòng thang rộng', 'Khoảng thông cao'],
  HALLWAY: ['Hành lang rộng', 'Trần cao'],
};

/** Hướng dẫn đo, đặt ngay cạnh các ô nhập. */
const MEASURE_HINTS: Record<PassageType, string> = {
  DOOR: 'Đo chỗ hở nhỏ nhất giữa hai khung cửa, và từ sàn lên thanh ngang phía trên cửa.',
  ELEVATOR:
    'Đo cửa thang (rộng × cao) và lòng cabin (rộng × sâu × cao). Tải trọng thường ghi trong cabin.',
  STAIRS:
    'Đo khoảng hở giữa hai tay vịn (rộng) và khoảng thông từ mặt bậc lên trần hoặc dầm (cao).',
  HALLWAY: 'Đo chỗ hẹp nhất của hành lang, và chiều cao từ sàn lên trần.',
};

/** Số đo phổ biến, bấm để điền nhanh. Các ô không có trong preset giữ nguyên. */
type Preset = { label: string; values: Partial<Record<keyof FormValue, number>> };
type FormValue = {
  width: number;
  height: number;
  cabinWidth: number;
  cabinLength: number;
  cabinHeight: number;
  loadCapacityKg: number;
};
const PRESETS: Record<PassageType, Preset[]> = {
  DOOR: [
    { label: '70 × 200', values: { width: 70, height: 200 } },
    { label: '80 × 200', values: { width: 80, height: 200 } },
    { label: '90 × 210', values: { width: 90, height: 210 } },
  ],
  ELEVATOR: [
    {
      label: 'Chung cư thường',
      values: {
        width: 80,
        height: 200,
        cabinWidth: 110,
        cabinLength: 140,
        cabinHeight: 220,
        loadCapacityKg: 630,
      },
    },
    {
      label: 'Thang rộng',
      values: {
        width: 90,
        height: 210,
        cabinWidth: 140,
        cabinLength: 160,
        cabinHeight: 230,
        loadCapacityKg: 1000,
      },
    },
  ],
  STAIRS: [
    { label: '80 × 200', values: { width: 80, height: 200 } },
    { label: '100 × 220', values: { width: 100, height: 220 } },
  ],
  HALLWAY: [
    { label: '100 × 260', values: { width: 100, height: 260 } },
    { label: '120 × 270', values: { width: 120, height: 270 } },
  ],
};

@Component({
  selector: 'app-passage-form',
  imports: [ReactiveFormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './passage-form.component.html',
  styleUrl: './passage-form.component.css',
})
export class PassageFormComponent {
  /** Điểm đang sửa, `null` là thêm mới. */
  readonly passage = input<WalkwayPassage | null>(null);
  readonly save = output<WalkwayPassage>();
  readonly cancel = output<void>();

  protected readonly typeOptions = Object.entries(PASSAGE_TYPE_NAMES) as [PassageType, string][];

  protected readonly form = new FormGroup({
    type: new FormControl<PassageType>('DOOR', { nonNullable: true }),
    label: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    width: new FormControl<number | null>(null, CM),
    height: new FormControl<number | null>(null, CM),
    cabinWidth: new FormControl<number | null>(null, CM),
    cabinLength: new FormControl<number | null>(null, CM),
    cabinHeight: new FormControl<number | null>(null, CM),
    loadCapacityKg: new FormControl<number | null>(null, [
      Validators.min(1),
      Validators.max(10000),
    ]),
  });

  protected readonly typeIcons = TYPE_ICONS;

  protected readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly isElevator = computed(() => this.type() === 'ELEVATOR');
  protected readonly openingLabels = computed(() => OPENING_LABELS[this.type()]);
  protected readonly hint = computed(() => MEASURE_HINTS[this.type()]);
  protected readonly presets = computed(() => PRESETS[this.type()]);

  protected chooseType(type: PassageType): void {
    this.form.controls.type.setValue(type);
  }

  protected applyPreset(preset: Preset): void {
    this.form.patchValue(preset.values);
    this.form.markAsDirty();
  }

  constructor() {
    effect(() => {
      const passage = this.passage();
      this.form.reset({ type: 'DOOR', label: '' });
      if (passage) this.form.patchValue(passage);
    });
    effect(() => {
      for (const field of CABIN_FIELDS) {
        const control = this.form.controls[field];
        if (this.isElevator()) control.enable();
        else control.disable();
      }
    });
  }

  protected invalid(field: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Field bị tắt (cabin khi không phải thang máy) không có trong `value`.
    const value = this.form.getRawValue();
    const passage: WalkwayPassage = {
      type: value.type,
      width: value.width as number,
      height: value.height as number,
    };
    if (value.label.trim()) passage.label = value.label.trim();
    if (value.type === 'ELEVATOR') {
      passage.cabinWidth = value.cabinWidth as number;
      passage.cabinLength = value.cabinLength as number;
      passage.cabinHeight = value.cabinHeight as number;
      if (value.loadCapacityKg) passage.loadCapacityKg = value.loadCapacityKg;
    }
    this.save.emit(passage);
  }
}
