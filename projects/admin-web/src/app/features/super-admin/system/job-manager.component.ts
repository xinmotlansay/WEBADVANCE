import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { SuperAdminApiService } from '../../../services/super-admin/super-admin-api.service';
import type { AdminJob, JobInput, JobLevel, JobStatus, JobType } from '../super-admin.models';

const TYPE_LABELS: Record<JobType, string> = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', INTERN: 'Thực tập' };
const LEVEL_LABELS: Record<JobLevel, string> = { INTERN: 'Thực tập sinh', JUNIOR: 'Nhân viên', SENIOR: 'Chuyên viên cao cấp', MANAGER: 'Quản lý' };
const STATUS_LABELS: Record<JobStatus, { label: string; tone: string }> = {
  OPEN: { label: 'Đang tuyển', tone: 'success' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  HIDDEN: { label: 'Đang ẩn', tone: 'attention' },
};

const toLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** Đăng, sửa, đóng hoặc xóa vị trí tuyển dụng hiển thị ở trang Tuyển dụng bên website khách. */
@Component({
  selector: 'app-sa-job-manager',
  imports: [ReactiveFormsModule],
  templateUrl: './job-manager.component.html',
  styleUrl: './showroom-manager.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobManagerComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly confirmDialog = viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');

  protected readonly types = Object.entries(TYPE_LABELS) as [JobType, string][];
  protected readonly levels = Object.entries(LEVEL_LABELS) as [JobLevel, string][];
  protected readonly statuses = Object.entries(STATUS_LABELS).map(([value, v]) => [value, v.label] as [JobStatus, string]);
  protected readonly typeLabels = TYPE_LABELS;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly list = signal<AdminJob[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly filter = signal<'ALL' | JobStatus>('ALL');
  protected readonly editing = signal<AdminJob | null>(null);
  protected readonly toDelete = signal<AdminJob | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly shown = computed(() => {
    const filter = this.filter();
    return (this.list() ?? []).filter((j) => filter === 'ALL' || j.status === filter);
  });
  protected readonly openCount = computed(() => (this.list() ?? []).filter((j) => j.status === 'OPEN').length);

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    department: ['', [Validators.required, Validators.maxLength(60)]],
    city: ['', [Validators.required, Validators.maxLength(60)]],
    type: this.fb.control<JobType>('FULL_TIME'),
    level: this.fb.control<JobLevel>('JUNIOR'),
    salary: ['Thỏa thuận', Validators.maxLength(60)],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(999)]],
    deadline: [''],
    status: this.fb.control<JobStatus>('OPEN'),
    summary: ['', Validators.maxLength(500)],
    responsibilities: [''],
    requirements: [''],
    benefits: [''],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set(null);
    this.api.jobs().subscribe({
      next: (rows) => this.list.set(rows),
      error: (err: unknown) => this.loadError.set(parseApiError(err).message),
    });
  }

  /** Gợi ý phòng ban và nơi làm việc đã dùng để nhập nhanh và không lệch chính tả (bộ lọc bên khách gom theo đúng chữ này). */
  distinct(field: 'department' | 'city'): string[] {
    return [...new Set((this.list() ?? []).map((j) => j[field]))].sort();
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ type: 'FULL_TIME', level: 'JUNIOR', salary: 'Thỏa thuận', quantity: 1, status: 'OPEN' });
    this.show();
  }

  openEdit(job: AdminJob): void {
    this.editing.set(job);
    this.form.reset({
      ...job,
      deadline: job.deadline ?? '',
      responsibilities: job.responsibilities.join('\n'),
      requirements: job.requirements.join('\n'),
      benefits: job.benefits.join('\n'),
    });
    this.show();
  }

  closeForm(): void {
    this.dialog()?.nativeElement.close();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: JobInput = {
      ...v,
      quantity: Number(v.quantity) || 1,
      deadline: v.deadline || null,
      responsibilities: toLines(v.responsibilities),
      requirements: toLines(v.requirements),
      benefits: toLines(v.benefits),
      displayOrder: this.editing()?.displayOrder ?? 0,
    };
    const editing = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    (editing ? this.api.updateJob(editing.id, body) : this.api.createJob(body))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.closeForm();
          this.load();
        },
        error: (err: unknown) => this.formError.set(this.describe(err)),
      });
  }

  askDelete(job: AdminJob): void {
    this.toDelete.set(job);
    this.confirmDialog()?.nativeElement.showModal();
  }

  closeDelete(): void {
    this.confirmDialog()?.nativeElement.close();
    this.toDelete.set(null);
  }

  confirmDelete(): void {
    const job = this.toDelete();
    if (!job) return;
    this.saving.set(true);
    this.api
      .deleteJob(job.id)
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
