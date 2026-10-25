import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from 'shared';
import { catchError, finalize, map, of, shareReplay, tap, Observable, timeout } from 'rxjs';
export interface Customer {
  id: string;
  fullName: string;
  email?: string;
  roleName: string;
}
interface Session {
  user: Customer;
  accessToken: string;
}
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<Customer | null>(null);
  readonly token = signal<string | null>(null);
  private pending?: Observable<boolean>;
  login(identifier: string, password: string) {
    return this.http
      .post<ApiResponse<Session>>('/api/v1/auth/login', { identifier, password })
      .pipe(
        timeout(5000),
        tap((r) => this.setSession(r.data)),
        map((r) => r.data.user),
      );
  }
  restore(): Observable<boolean> {
    if (!this.pending)
      this.pending = this.http.post<ApiResponse<Session>>('/api/v1/auth/refresh', {}).pipe(
        timeout(5000),
        tap((r) => this.setSession(r.data)),
        map(() => true),
        catchError(() => {
          this.clear();
          return of(false);
        }),
        finalize(() => {
          this.pending = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.pending;
  }
  logout() {
    return this.http.post('/api/v1/auth/logout', {}).pipe(tap(() => this.clear()));
  }
  clear(): void {
    this.user.set(null);
    this.token.set(null);
  }
  private setSession(session: Session): void {
    this.user.set(session.user);
    this.token.set(session.accessToken);
  }
}
