import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AdminLoginResponse, AdminSession, ApiResponse, AuthUser, LoginRequest } from 'shared';
import {
  EMPTY,
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  shareReplay,
  tap,
  timeout,
} from 'rxjs';

const API_BASE = '/api/v1/admin/auth';
/** Phiên Admin hết hạn sau 30 phút không thao tác (NF-A02), dùng khi server chưa trả giá trị. */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;

export class AdminAuthError extends Error {}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private readonly _idleTimeoutSeconds = signal(DEFAULT_IDLE_TIMEOUT_SECONDS);
  private refreshInFlight: Observable<string> | null = null;

  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly idleTimeoutSeconds = this._idleTimeoutSeconds.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.roleName ?? null);

  login(body: LoginRequest): Observable<AdminLoginResponse> {
    return this.http
      .post<ApiResponse<AdminLoginResponse>>(`${API_BASE}/login`, body, { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((data) => {
          this._accessToken.set(data.accessToken);
          this.applySession(data);
        }),
      );
  }

  refresh(): Observable<string> {
    return this.http
      .post<ApiResponse<{ accessToken: string }>>(
        `${API_BASE}/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(
        map((response) => response.data.accessToken),
        tap((token) => this._accessToken.set(token)),
      );
  }

  /** Nhiều request cùng nhận 401 thì chỉ gọi refresh một lần. */
  refreshOnce(): Observable<string> {
    this.refreshInFlight ??= this.refresh().pipe(
      finalize(() => {
        this.refreshInFlight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.refreshInFlight;
  }

  loadMe(): Observable<AdminSession> {
    return this.http.get<ApiResponse<AdminSession>>(`${API_BASE}/me`).pipe(
      map((response) => response.data),
      tap((data) => this.applySession(data)),
    );
  }

  /** Khôi phục phiên sau khi tải lại trang: refresh token nằm trong cookie httpOnly. */
  async restoreSession(): Promise<void> {
    try {
      await firstValueFrom(this.refresh().pipe(timeout(5000)));
      await firstValueFrom(this.loadMe().pipe(timeout(5000)));
    } catch {
      this.clearSession();
    }
  }

  logout(): void {
    this.http
      .post(`${API_BASE}/logout`, {}, { withCredentials: true })
      .pipe(catchError(() => EMPTY))
      .subscribe();

    this.clearSession();
    void this.router.navigate(['/admin/login']);
  }

  /** Phiên hết hạn do không thao tác: về trang đăng nhập và quay lại đúng trang đang làm sau khi đăng nhập. */
  expireSession(): void {
    const returnUrl = this.router.url;
    this.http
      .post(`${API_BASE}/logout`, {}, { withCredentials: true })
      .pipe(catchError(() => EMPTY))
      .subscribe();

    this.clearSession();
    void this.router.navigate(['/admin/login'], { queryParams: { expired: '1', returnUrl } });
  }

  clearSession(): void {
    this._user.set(null);
    this._accessToken.set(null);
  }

  private applySession(data: AdminSession): void {
    this._user.set(data.user);
    this._idleTimeoutSeconds.set(data.sessionIdleTimeoutSeconds);
  }
}
