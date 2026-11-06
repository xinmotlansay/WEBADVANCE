import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  input,
  OnInit,
  output,
} from '@angular/core';
import { invalidFieldMessages } from '../after-sales/form-problems';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { WarrantyService } from 'shared';
import { AuthService } from '../../services/auth/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { EvidenceUploadComponent } from '../../shared/ui/evidence-upload/evidence-upload.component';
@Component({
  selector: 'app-warranty-form',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, EvidenceUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warranty-form.component.html',
  styleUrl: '../after-sales/request-form.css',
})
export class WarrantyFormComponent implements OnInit {
  readonly embedded = input(false);
  /** Phiếu đã chọn sẵn từ bước tìm sản phẩm: ẩn ô chọn phiếu. */
  readonly presetCardId = input('');
  readonly requestCreated = output<string>();
  private readonly api = inject(WarrantyService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  protected readonly cards = signal<import('shared').WarrantyCard[] | null | undefined>(undefined);
  protected readonly evidence = signal<string[]>([]);
  protected readonly uploading = signal(false);
  protected readonly loading = signal(false);
  protected readonly problems = signal<string[]>([]);
  protected readonly error = signal('');
  protected readonly defectTypes = [
    'Lỗi kết cấu khung / chân ghế',
    'Lỗi bề mặt, màu sắc, bong tróc',
    'Lỗi vải / da / đệm mút',
    'Lỗi phụ kiện, bản lề, ray trượt',
    'Lỗi khác',
  ];
  protected readonly form = this.fb.nonNullable.group({
    warrantyCardId: [this.route.snapshot.queryParamMap.get('card') ?? '', Validators.required],
    defectType: ['', Validators.required],
    defectDescription: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(500)],
    ],
    agree: [false, Validators.requiredTrue],
    contact: this.fb.nonNullable.group({
      name: [
        this.auth.user()?.fullName ?? '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
      ],
      phone: [
        this.auth.user()?.phoneNumber ?? '',
        [Validators.required, Validators.pattern(/^(?:0|\+?84)\d{9,10}$/)],
      ],
      email: [this.auth.user()?.email ?? '', [Validators.required, Validators.email]],
      address: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    }),
  });
  private readonly selectedId = toSignal(this.form.controls.warrantyCardId.valueChanges, {
    initialValue: this.form.controls.warrantyCardId.value,
  });
  protected readonly selected = computed(() => {
    const id = this.selectedId() || this.presetCardId();
    return (this.cards() ?? []).find((card) => card.id === id) ?? null;
  });
  constructor() {
    this.reload();
  }
  ngOnInit(): void {
    if (this.presetCardId()) this.form.controls.warrantyCardId.setValue(this.presetCardId());
  }
  protected reload(): void {
    this.cards.set(undefined);
    this.api
      .cards()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (cards) => this.cards.set(cards), error: () => this.cards.set(null) });
  }
  protected submit(): void {
    this.form.markAllAsTouched();
    const problems = invalidFieldMessages(this.form);
    if (!this.evidence().length) problems.push('Tải lên ít nhất một ảnh hoặc video minh chứng.');
    this.problems.set([...new Set(problems)]);
    if (problems.length || this.loading() || this.uploading()) return;
    const raw = this.form.getRawValue();
    this.error.set('');
    this.loading.set(true);
    this.api
      .create({
        warrantyCardId: raw.warrantyCardId,
        defectType: raw.defectType,
        defectDescription: raw.defectDescription,
        contact: raw.contact,
        evidence: this.evidence(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (this.embedded()) {
            this.requestCreated.emit(result.id);
            this.loading.set(false);
          } else void this.router.navigate(['/support/success'], { queryParams: { kind: 'warranty', request: result.id } });
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }
}
