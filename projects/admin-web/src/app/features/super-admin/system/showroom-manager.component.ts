import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { SuperAdminApiService } from '../../../services/super-admin/super-admin-api.service';
import type { AdminShowroom, ShowroomInput, ShowroomRegion } from '../super-admin.models';

const REGION_LABELS: Record<ShowroomRegion, string> = { NORTH: 'Miền Bắc', CENTRAL: 'Miền Trung', SOUTH: 'Miền Nam' };

/**
 * Danh sách cửa hàng: cùng dữ liệu với bản đồ "Hệ thống showroom" và trang /showrooms bên website khách,
 * nên thêm, sửa, ẩn hoặc xóa ở đây là khách thấy ngay.
 */
@Component({
  selector: 'app-sa-showroom-manager',
  imports: [ReactiveFormsModule],
  templateUrl: './showroom-manager.component.html',
  styleUrl: './showroom-manager.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShowroomManagerComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly confirmDialog = viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');

  protected readonly regions = Object.entries(REGION_LABELS) as [ShowroomRegion, string][];
  protected readonly regionLabels = REGION_LABELS;

  protected readonly list = signal<AdminShowroom[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /** Đang sửa cửa hàng nào; null khi thêm mới. */
  protected readonly editing = signal<AdminShowroom | null>(null);
  protected readonly toDelete = signal<AdminShowroom | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    city: ['', [Validators.required, Validators.maxLength(60)]],
    region: this.fb.control<ShowroomRegion>('SOUTH'),
    address: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(300)]],
    phone: ['', Validators.maxLength(20)],
    openTime: ['08:00', Validators.required],
    closeTime: ['21:00', Validators.required],
    latitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
    image: [''],
    displayOrder: [0],
    isFlagship: [false],
    visible: [true],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set(null);
    this.api.showrooms().subscribe({
      next: (rows) => this.list.set(rows),
      error: (err: unknown) => this.loadError.set(parseApiError(err).message),
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ region: 'SOUTH', openTime: '08:00', closeTime: '21:00', displayOrder: (this.list()?.length ?? 0) + 1, visible: true });
    this.show();
  }

  openEdit(row: AdminShowroom): void {
    this.editing.set(row);
    this.form.reset({ ...row, phone: row.phone, visible: row.status === 'VISIBLE' });
    this.show();
  }

  closeForm(): void {
    this.dialog()?.nativeElement.close();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { visible, ...rest } = this.form.getRawValue();
    const body = { ...rest, latitude: Number(rest.latitude), longitude: Number(rest.longitude), displayOrder: Number(rest.displayOrder) || 0, status: visible ? 'VISIBLE' : 'HIDDEN' } as ShowroomInput;
    const editing = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    (editing ? this.api.updateShowroom(editing.id, body) : this.api.createShowroom(body))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.closeForm();
          this.load();
        },
        error: (err: unknown) => this.formError.set(this.describe(err)),
      });
  }

  askDelete(row: AdminShowroom): void {
    this.toDelete.set(row);
    this.confirmDialog()?.nativeElement.showModal();
  }

  closeDelete(): void {
    this.confirmDialog()?.nativeElement.close();
    this.toDelete.set(null);
  }

  confirmDelete(): void {
    const row = this.toDelete();
    if (!row) return;
    this.saving.set(true);
    this.api
      .deleteShowroom(row.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.closeDelete();
          this.load();
        },
        error: (err: unknown) => {
          this.closeDelete();
          this.loadError.set(parseApiError(err).message);
        },
      });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.touched && control.invalid;
  }

  mapsUrl(): string {
    const { address, name } = this.form.getRawValue();
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || name)}`;
  }

  private show(): void {
    this.formError.set(null);
    this.dialog()?.nativeElement.showModal();
  }

  private describe(err: unknown): string {
    const details = (err as { error?: { error?: { details?: { field?: string; issue?: string }[] } } })?.error?.error?.details;
    const first = Array.isArray(details) ? details[0] : undefined;
    return first?.issue ?? parseApiError(err).message;
  }
}
