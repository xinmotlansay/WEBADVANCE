import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { Observable, EMPTY, catchError, finalize, firstValueFrom, map, shareReplay, tap, timeout } from 'rxjs';

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

  refresh(): Observable<string> {
    return this.http
      .post<ApiResponse<{ accessToken: string }>>(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        map((response) => response.data.accessToken),
        tap((token) => this._accessToken.set(token)),
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
    return this.http
      .get<ApiResponse<{ user: AuthUser }>>(`${API_BASE}/auth/me`)
      .pipe(
        map((response) => response.data.user),
        tap((user) => this._user.set(user)),
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

export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
