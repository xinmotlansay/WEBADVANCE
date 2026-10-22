import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { PassageType, WalkwayPassage } from 'shared';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { PASSAGE_TYPE_NAMES } from '../../fit-labels';

const CM = [Validators.required, Validators.min(20), Validators.max(1000)];
const CABIN_FIELDS = ['cabinWidth', 'cabinLength', 'cabinHeight', 'loadCapacityKg'] as const;

/** Nhãn hai số đo chính theo loại lối đi. */
const OPENING_LABELS: Record<PassageType, [string, string]> = {
  DOOR: ['Cửa rộng', 'Cửa cao'],
  ELEVATOR: ['Cửa rộng', 'Cửa cao'],
  STAIRS: ['Lòng thang rộng', 'Khoảng thông cao'],
  HALLWAY: ['Hành lang rộng', 'Trần cao'],
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

  private readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly isElevator = computed(() => this.type() === 'ELEVATOR');
  protected readonly openingLabels = computed(() => OPENING_LABELS[this.type()]);

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
