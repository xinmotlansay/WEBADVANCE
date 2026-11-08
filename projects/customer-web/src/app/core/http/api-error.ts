import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from 'shared';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/** Đọc lỗi chuẩn của API; lỗi mạng hoặc không đúng định dạng thì trả thông báo chung. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiErrorBody> | null;
    if (body?.error?.code) return body.error;
    if (err.status === 0) {
      return { code: 'NETWORK_ERROR', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' };
    }
  }
  return { code: 'UNKNOWN', message: 'Có lỗi xảy ra. Vui lòng thử lại.' };
}
