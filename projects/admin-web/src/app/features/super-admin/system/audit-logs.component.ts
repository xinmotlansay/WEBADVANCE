import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { ApiPageResponse } from 'shared';
import { catchError, of, switchMap, tap } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import * as fmt from '../../../core/format/vn-format';
import { ROLE_LABELS } from '../../../core/navigation/admin-nav.config';
import { SuperAdminApiService } from '../super-admin-api.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS, auditActionLabel, auditTargetLabel } from '../super-admin.labels';
import type { AdminAccount, AuditLog, AuditLogQuery } from '../super-admin.models';
import { SystemTabsComponent } from './system-tabs.component';

const PAGE_SIZE = 20;

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

/** Nhật ký hoạt động: chỉ xem, không sửa hay xóa (AD-10, NF-A04). */
@Component({
  selector: 'app-sa-audit-logs',
  imports: [SystemTabsComponent],
  templateUrl: './audit-logs.component.html',
  styleUrl: './system.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogsComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly popupRef = viewChild<ElementRef<HTMLElement>>('popup');

  readonly fmt = fmt;
  readonly roleLabels = ROLE_LABELS;
  readonly actionLabel = auditActionLabel;
  readonly actions = Object.entries(AUDIT_ACTIONS);
  readonly targets = Object.entries(AUDIT_TARGETS);

  readonly query = signal<AuditLogQuery>({ page: 1, limit: PAGE_SIZE });
  readonly result = signal<ApiPageResponse<AuditLog> | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly reload = signal(0);

  readonly admins = signal<AdminAccount[]>([]);
  readonly open = signal<AuditLog | null>(null);
  private popupOpener: HTMLElement | null = null;

  readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.userId || q.action || q.targetType || q.from || q.to);
  });

  readonly diff = computed<DiffRow[]>(() => {
    const log = this.open();
    if (!log) return [];
    const before = flatten(log.oldValue);
    const after = flatten(log.newValue);
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return fields
      .map((field) => ({ field: field || 'Giá trị', before: before[field] ?? '—', after: after[field] ?? '—' }))
      .filter((row) => row.before !== row.after);
  });

  constructor() {
    this.api.listAdmins({ page: 1, limit: 100 }).subscribe({ next: (res) => this.admins.set(res.data), error: () => undefined });

    toObservable(computed(() => [this.query(), this.reload()] as const))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(([query]) =>
          this.api.auditLogs(query).pipe(
            catchError((err: unknown) => {
              this.error.set(parseApiError(err).message);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res) this.result.set(res);
        this.loading.set(false);
      });
  }

  patch(patch: Partial<AuditLogQuery>): void {
    this.query.update((q) => ({ ...q, page: 1, ...patch }));
  }

  goPage(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }

  clearFilters(): void {
    this.query.set({ page: 1, limit: PAGE_SIZE });
  }

  retry(): void {
    this.reload.update((n) => n + 1);
  }

  targetLabel(type: string): string {
    return auditTargetLabel(type);
  }

  openPopup(log: AuditLog, event: Event): void {
    this.popupOpener = event.currentTarget as HTMLElement;
    this.open.set(log);
    setTimeout(() => this.popupRef()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closePopup(): void {
    if (!this.open()) return;
    this.open.set(null);
    this.popupOpener?.focus();
  }
}

/** Đổi object lồng nhau thành `{ "a.b": "giá trị" }` để so sánh trước/sau theo từng field. */
function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined) return out;
  if (typeof value !== 'object') {
    out[prefix] = String(value);
    return out;
  }
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) {
    out[prefix] = value.join(', ');
    return out;
  }
  for (const [key, inner] of Object.entries(value)) {
    flatten(inner, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}
