import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiResponse } from '../models/api-response.model';
import type { FitCheckRequest, FitCheckResult, SimilarFitItem } from '../models/fit.model';

const API_BASE = '/api/v1/fit-your-home';

@Injectable({ providedIn: 'root' })
export class FitApiService {
  private readonly http = inject(HttpClient);

  check(body: FitCheckRequest): Observable<FitCheckResult> {
    return this.http
      .post<ApiResponse<FitCheckResult>>(`${API_BASE}/check`, body)
      .pipe(map((r) => r.data));
  }

  similar(body: FitCheckRequest & { includeCaution: boolean }): Observable<SimilarFitItem[]> {
    return this.http
      .post<ApiResponse<SimilarFitItem[]>>(`${API_BASE}/similar`, body)
      .pipe(map((r) => r.data));
  }
}
