import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { Address, CreateAddressRequest, UpdateAddressRequest } from '../models/address.model';
import type { ApiResponse } from '../models/api-response.model';

const API_BASE = '/api/v1/users/me/addresses';

/** Sổ địa chỉ (API Design mục 2). Địa chỉ mặc định đứng đầu danh sách. */
@Injectable({ providedIn: 'root' })
export class AddressApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<Address[]> {
    return this.http.get<ApiResponse<Address[]>>(API_BASE).pipe(map((r) => r.data));
  }

  create(body: CreateAddressRequest): Observable<Address> {
    return this.http.post<ApiResponse<Address>>(API_BASE, body).pipe(map((r) => r.data));
  }

  /** `{ isDefault: true }` để đặt làm mặc định. */
  update(id: string, body: UpdateAddressRequest): Observable<Address> {
    return this.http
      .patch<ApiResponse<Address>>(`${API_BASE}/${id}`, body)
      .pipe(map((r) => r.data));
  }
}
