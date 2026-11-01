import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiPageResponse, ApiResponse, RoleName } from 'shared';
import { Observable, map } from 'rxjs';
import type {
  AdminAccount,
  AdminListQuery,
  AdminListResponse,
  AuditLog,
  AuditLogQuery,
  ConfigGroup,
  CreateAdminBody,
  Overview,
  OverviewRange,
  RolesResponse,
} from './super-admin.models';

const API = '/api/v1/admin';

/** Bỏ tham số rỗng để URL gọn và backend không nhận chuỗi rỗng. */
function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
  }
  return params;
}

/** API của Admin cấp cao (API Design 11.5). */
@Injectable({ providedIn: 'root' })
export class SuperAdminApiService {
  private readonly http = inject(HttpClient);

  overview(range: OverviewRange): Observable<Overview> {
    return this.http
      .get<ApiResponse<Overview>>(`${API}/dashboard/overview`, { params: { range } })
      .pipe(map((res) => res.data));
  }

  listAdmins(query: AdminListQuery): Observable<AdminListResponse> {
    return this.http.get<AdminListResponse>(`${API}/admins`, { params: toParams(query) });
  }

  createAdmin(body: CreateAdminBody): Observable<{ admin: AdminAccount; inviteExpiresAt: string }> {
    return this.http
      .post<ApiResponse<{ admin: AdminAccount; inviteExpiresAt: string }>>(`${API}/admins`, body)
      .pipe(map((res) => res.data));
  }

  updateAdmin(id: string, body: { fullName?: string; phoneNumber?: string | null }): Observable<AdminAccount> {
    return this.http.patch<ApiResponse<AdminAccount>>(`${API}/admins/${id}`, body).pipe(map((res) => res.data));
  }

  changeRole(id: string, roleName: RoleName): Observable<AdminAccount> {
    return this.http
      .patch<ApiResponse<AdminAccount>>(`${API}/admins/${id}/role`, { roleName })
      .pipe(map((res) => res.data));
  }

  deactivate(id: string, reason: string): Observable<AdminAccount> {
    return this.http
      .post<ApiResponse<AdminAccount>>(`${API}/admins/${id}/deactivate`, reason ? { reason } : {})
      .pipe(map((res) => res.data));
  }

  activate(id: string): Observable<AdminAccount> {
    return this.http.post<ApiResponse<AdminAccount>>(`${API}/admins/${id}/activate`, {}).pipe(map((res) => res.data));
  }

  resendInvite(id: string): Observable<{ inviteExpiresAt: string }> {
    return this.http
      .post<ApiResponse<{ inviteExpiresAt: string }>>(`${API}/admins/${id}/resend-invite`, {})
      .pipe(map((res) => res.data));
  }

  roles(): Observable<RolesResponse> {
    return this.http.get<ApiResponse<RolesResponse>>(`${API}/roles`).pipe(map((res) => res.data));
  }

  auditLogs(query: AuditLogQuery): Observable<ApiPageResponse<AuditLog>> {
    return this.http.get<ApiPageResponse<AuditLog>>(`${API}/audit-logs`, { params: toParams(query) });
  }

  systemConfigs(): Observable<ConfigGroup[]> {
    return this.http.get<ApiResponse<ConfigGroup[]>>(`${API}/system-configs`).pipe(map((res) => res.data));
  }

  updateSystemConfig(key: string, value: unknown): Observable<{ key: string; value: unknown }> {
    return this.http
      .put<ApiResponse<{ key: string; value: unknown }>>(`${API}/system-configs/${encodeURIComponent(key)}`, { value })
      .pipe(map((res) => res.data));
  }

  setPassword(token: string, password: string): Observable<{ email: string }> {
    return this.http
      .post<ApiResponse<{ email: string }>>(`${API}/auth/set-password`, { token, password })
      .pipe(map((res) => res.data));
  }
}
