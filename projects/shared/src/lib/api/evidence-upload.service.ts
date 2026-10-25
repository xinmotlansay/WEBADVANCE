import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
export interface UploadedEvidence {
  url: string;
  format: string;
  size: number;
}
export type EvidencePurpose = 'WARRANTY_EVIDENCE' | 'RETURN_EVIDENCE';
@Injectable({ providedIn: 'root' })
export class EvidenceUploadService {
  private readonly http = inject(HttpClient);
  upload(file: File, purpose: EvidencePurpose) {
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', purpose);
    return this.http
      .post<ApiResponse<UploadedEvidence>>('/api/v1/uploads', body)
      .pipe(map((r) => r.data));
  }
}
