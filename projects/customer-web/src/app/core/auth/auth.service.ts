import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  ApiResponse,
  AuthResponse,
  AuthUser,
  GoogleLinkOtpRequest,
  GoogleLinkOtpResponse,
  GoogleLinkRequest,
  GoogleLoginRequest,
  LoginRequest,
  OtpSendRequest,
  OtpSendResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  RegisterRequest,
  ResetPasswordRequest,
} from 'shared';
import {
  Observable,
  EMPTY,
  catchError,
  defer,
  finalize,
  firstValueFrom,
  map,
  shareReplay,
  tap,
  timeout,
} from 'rxjs';

const API_BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private refreshInFlight: Observable<string> | null = null;

  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/login`, body, { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((data) => this.applySession(data)),
      );
  }

  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/register`, body, { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((data) => this.applySession(data)),
      );
  }

  sendOtp(body: OtpSendRequest): Observable<OtpSendResponse> {
    return this.http
      .post<ApiResponse<OtpSendResponse>>(`${API_BASE}/auth/otp/send`, body)
      .pipe(map((response) => response.data));
  }

  verifyOtp(body: OtpVerifyRequest): Observable<OtpVerifyResponse> {
    return this.http
      .post<ApiResponse<OtpVerifyResponse>>(`${API_BASE}/auth/otp/verify`, body)
      .pipe(map((response) => response.data));
  }

  resetPassword(body: ResetPasswordRequest): Observable<void> {
    return this.http
      .post<ApiResponse<{ reset: boolean }>>(`${API_BASE}/auth/forgot-password/reset`, body)
      .pipe(map(() => undefined));
  }

  loginWithGoogle(body: GoogleLoginRequest): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/google`, body, { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((data) => this.applySession(data)),
      );
  }

  requestGoogleLinkOtp(body: GoogleLinkOtpRequest): Observable<GoogleLinkOtpResponse> {
    return this.http
      .post<ApiResponse<GoogleLinkOtpResponse>>(`${API_BASE}/auth/google/link/otp`, body)
      .pipe(map((response) => response.data));
  }

  linkGoogle(body: GoogleLinkRequest): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/google/link`, body, {
        withCredentials: true,
      })
      .pipe(
        map((response) => response.data),
        tap((data) => this.applySession(data)),
      );
  }

  /**
   * Refresh token bị xoay sau mỗi lần dùng, nên các tab phải refresh lần lượt: tab sau chờ khóa
   * rồi mới gửi, lúc đó cookie đã là token mới của tab trước.
   */
  refresh(): Observable<string> {
    const request = () =>
      firstValueFrom(
        this.http.post<ApiResponse<AuthResponse>>(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );

    return defer(() => navigator.locks?.request('auth-refresh', request) ?? request()).pipe(
      tap((response) => this.applySession(response.data)),
      map((response) => response.data.accessToken),
    );
  }

  /** Dùng khi nhiều request cùng nhận 401: chỉ gọi refresh một lần. */
  refreshOnce(): Observable<string> {
    this.refreshInFlight ??= this.refresh().pipe(
      finalize(() => {
        this.refreshInFlight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    return this.refreshInFlight;
  }

  loadMe(): Observable<AuthUser> {
    return this.http.get<ApiResponse<{ user: AuthUser }>>(`${API_BASE}/auth/me`).pipe(
      map((response) => response.data.user),
      tap((user) => this._user.set(user)),
    );
  }

  /**
   * Khôi phục phiên sau khi tải lại trang: refresh token nằm trong cookie httpOnly. Refresh trả kèm
   * tài khoản nên chỉ cần một request; app chờ bước này trước khi hiện trang.
   */
  async restoreSession(): Promise<void> {
    try {
      await firstValueFrom(this.refresh().pipe(timeout(5000)));
    } catch {
      this.clearSession();
    }
  }

  logout(): void {
    this.http
      .post(`${API_BASE}/auth/logout`, {}, { withCredentials: true })
      .pipe(catchError(() => EMPTY))
      .subscribe();

    this.clearSession();
    void this.router.navigate(['/auth/login']);
  }

  clearSession(): void {
    this._user.set(null);
    this._accessToken.set(null);
  }

  private applySession(data: AuthResponse): void {
    this._accessToken.set(data.accessToken);
    this._user.set(data.user);
  }
}
