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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ADMIN_ROLE_NAMES, RoleName } from 'shared';
import { Observable, catchError, debounceTime, finalize, of, switchMap, tap } from 'rxjs';
import { AdminAuthService } from '../../../core/auth/admin-auth.service';
import { parseApiError } from '../../../core/auth/auth-error';
import * as fmt from '../../../core/format/vn-format';
import { ROLE_LABELS } from '../../../core/navigation/admin-nav.config';
import { SuperAdminApiService } from '../super-admin-api.service';
import type { AccessLevel, AdminAccount, AdminListQuery, AdminListResponse, RolesResponse } from '../super-admin.models';

const PHONE_PATTERN = /^(0|\+84)\d{9}$/;
const PAGE_SIZE = 20;

/** Quản lý tài khoản Admin và xem ma trận quyền (AD-10 → AD-14). */
@Component({
  selector: 'app-sa-admins',
  imports: [ReactiveFormsModule],
  templateUrl: './admins.component.html',
  styleUrl: './admins.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminsComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly auth = inject(AdminAuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private readonly createDialog = viewChild<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly confirmDialog = viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');
  private readonly popupRef = viewChild<ElementRef<HTMLElement>>('popup');

  readonly fmt = fmt;
  readonly roleNames = ADMIN_ROLE_NAMES;
  readonly roleLabels = ROLE_LABELS;
  readonly meId = computed(() => this.auth.user()?.id ?? '');

  readonly tab = signal<'accounts' | 'roles'>('accounts');
  readonly query = signal<AdminListQuery>({ q: '', roleName: '', status: '', page: 1, limit: PAGE_SIZE });
  readonly list = signal<AdminListResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  private readonly reload = signal(0);

  readonly roles = signal<RolesResponse | null>(null);
  readonly rolesError = signal<string | null>(null);

  readonly open = signal<AdminAccount | null>(null);
  readonly saving = signal(false);
  readonly popupError = signal<string | null>(null);
  private popupOpener: HTMLElement | null = null;

  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  /** Hộp xác nhận dùng chung cho đổi vai trò và vô hiệu hóa. */
  readonly confirm = signal<{ title: string; message: string; action: string; danger: boolean; askReason: boolean } | null>(null);
  private confirmRun: ((reason: string) => void) | null = null;
  readonly confirmReason = signal('');

  readonly createForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    phoneNumber: ['', [Validators.pattern(PHONE_PATTERN)]],
    roleName: [RoleName.ORDER_ADMIN as RoleName, Validators.required],
  });

  readonly editForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    phoneNumber: ['', [Validators.pattern(PHONE_PATTERN)]],
    roleName: [RoleName.ORDER_ADMIN as RoleName],
  });

  readonly summary = computed(() => {
    const s = this.list()?.summary;
    if (!s) return null;
    const rows = this.roleNames.map((name) => ({ name, ...(s.byRole[name] ?? { active: 0, locked: 0 }) }));
    const totalActive = rows.reduce((sum, r) => sum + r.active, 0);
    const max = Math.max(1, ...rows.map((r) => r.active));
    return { rows: rows.map((r) => ({ ...r, width: (r.active / max) * 100 })), totalActive, pendingInvites: s.pendingInvites };
  });

  readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.q || q.roleName || q.status);
  });

  constructor() {
    toObservable(computed(() => [this.query(), this.reload()] as const))
      .pipe(
        debounceTime(200),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(([query]) =>
          this.api.listAdmins(query).pipe(
            catchError((err: unknown) => {
              this.error.set(parseApiError(err).message);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res) this.list.set(res);
        this.loading.set(false);
      });
  }

  setTab(tab: 'accounts' | 'roles'): void {
    this.tab.set(tab);
    if (tab === 'roles' && !this.roles()) this.loadRoles();
  }

  loadRoles(): void {
    this.rolesError.set(null);
    this.api.roles().subscribe({
      next: (res) => this.roles.set(res),
      error: (err: unknown) => this.rolesError.set(parseApiError(err).message),
    });
  }

  patchQuery(patch: Partial<AdminListQuery>): void {
    this.query.update((q) => ({ ...q, page: 1, ...patch }));
  }

  goPage(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }

  clearFilters(): void {
    this.query.set({ q: '', roleName: '', status: '', page: 1, limit: PAGE_SIZE });
  }

  retry(): void {
    this.reload.update((n) => n + 1);
  }

  statusOf(a: AdminAccount): { label: string; tone: string } {
    if (a.status === 'LOCKED') return { label: 'Đã vô hiệu hóa', tone: 'danger' };
    if (a.pendingInvite) return { label: 'Chờ đặt mật khẩu', tone: 'attention' };
    return { label: 'Hoạt động', tone: 'success' };
  }

  accessLabel(level: AccessLevel): string {
    return level === 'FULL' ? 'Toàn quyền' : level === 'VIEW' ? 'Chỉ xem' : '—';
  }

  // ---- Tạo Admin (AD-11)

  openCreate(): void {
    this.createForm.reset();
    this.createError.set(null);
    this.createDialog()?.nativeElement.showModal();
  }

  closeCreate(): void {
    this.createDialog()?.nativeElement.close();
  }

  submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { email, fullName, phoneNumber, roleName } = this.createForm.getRawValue();
    this.creating.set(true);
    this.createError.set(null);
    this.api
      .createAdmin({ email: email.trim().toLowerCase(), fullName: fullName.trim(), roleName, ...(phoneNumber ? { phoneNumber } : {}) })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (res) => {
          this.closeCreate();
          this.flash(`Đã tạo tài khoản ${res.admin.email}. Liên kết đặt mật khẩu có hạn đến ${fmt.formatDateTime(res.inviteExpiresAt)}.`);
          this.retry();
        },
        error: (err: unknown) => {
          const parsed = parseApiError(err);
          this.createError.set(parsed.code === 'EMAIL_EXISTS' ? 'Email này đã có tài khoản. Dùng email khác.' : parsed.message);
        },
      });
  }

  // ---- Popup chi tiết (AD-12, AD-13)

  openPopup(admin: AdminAccount, event: Event): void {
    this.popupOpener = event.currentTarget as HTMLElement;
    this.open.set(admin);
    this.popupError.set(null);
    this.editForm.reset({ fullName: admin.fullName, phoneNumber: admin.phoneNumber ?? '', roleName: admin.roleName });
    setTimeout(() => this.popupRef()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closePopup(): void {
    if (!this.open() || this.confirm()) return;
    this.open.set(null);
    this.popupOpener?.focus();
  }

  save(): void {
    const admin = this.open();
    if (!admin) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { fullName, phoneNumber, roleName } = this.editForm.getRawValue();
    const infoChanged = fullName.trim() !== admin.fullName || phoneNumber !== (admin.phoneNumber ?? '');
    const roleChanged = roleName !== admin.roleName;
    if (!infoChanged && !roleChanged) {
      this.popupError.set('Chưa có thay đổi nào để lưu.');
      return;
    }

    const run = () => {
      let chain: Observable<AdminAccount> = of(admin);
      if (infoChanged) {
        chain = this.api.updateAdmin(admin.id, { fullName: fullName.trim(), phoneNumber: phoneNumber || null });
      }
      if (roleChanged) {
        chain = chain.pipe(switchMap(() => this.api.changeRole(admin.id, roleName)));
      }
      this.runAction(chain, 'Đã lưu thay đổi.');
    };

    if (roleChanged) {
      this.askConfirm(
        {
          title: 'Đổi vai trò?',
          message: `${admin.fullName} sẽ chuyển từ ${ROLE_LABELS[admin.roleName]} sang ${ROLE_LABELS[roleName]}, bị đăng xuất và chỉ thấy menu của vai trò mới.`,
          action: 'Đổi vai trò',
          danger: false,
          askReason: false,
        },
        run,
      );
    } else {
      run();
    }
  }

  deactivate(): void {
    const admin = this.open();
    if (!admin) return;
    this.askConfirm(
      {
        title: 'Vô hiệu hóa tài khoản?',
        message: `${admin.fullName} sẽ bị đăng xuất ngay và không đăng nhập được nữa. Tài khoản và nhật ký vẫn được giữ, có thể kích hoạt lại sau.`,
        action: 'Vô hiệu hóa',
        danger: true,
        askReason: true,
      },
      (reason) => this.runAction(this.api.deactivate(admin.id, reason), 'Đã vô hiệu hóa tài khoản.'),
    );
  }

  activate(): void {
    const admin = this.open();
    if (admin) this.runAction(this.api.activate(admin.id), 'Đã kích hoạt lại tài khoản.');
  }

  resendInvite(): void {
    const admin = this.open();
    if (!admin) return;
    this.saving.set(true);
    this.api
      .resendInvite(admin.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => this.flash(`Đã gửi lại liên kết tới ${admin.email}, hạn đến ${fmt.formatDateTime(res.inviteExpiresAt)}.`),
        error: (err: unknown) => this.popupError.set(parseApiError(err).message),
      });
  }

  // ---- Hộp xác nhận

  private askConfirm(
    content: { title: string; message: string; action: string; danger: boolean; askReason: boolean },
    run: (reason: string) => void,
  ): void {
    this.confirm.set(content);
    this.confirmReason.set('');
    this.confirmRun = run;
    setTimeout(() => this.confirmDialog()?.nativeElement.showModal());
  }

  acceptConfirm(): void {
    const run = this.confirmRun;
    const reason = this.confirmReason().trim();
    this.closeConfirm();
    run?.(reason);
  }

  closeConfirm(): void {
    this.confirmDialog()?.nativeElement.close();
    this.confirm.set(null);
    this.confirmRun = null;
  }

  private runAction(action: Observable<AdminAccount>, message: string): void {
    this.saving.set(true);
    this.popupError.set(null);
    action.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (updated) => {
        this.open.set(updated);
        this.editForm.reset({ fullName: updated.fullName, phoneNumber: updated.phoneNumber ?? '', roleName: updated.roleName });
        this.flash(message);
        this.retry();
      },
      error: (err: unknown) => this.popupError.set(parseApiError(err).message),
    });
  }

  private flash(message: string): void {
    this.notice.set(message);
    setTimeout(() => {
      if (this.notice() === message) this.notice.set(null);
    }, 6000);
  }
}
