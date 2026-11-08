import { HttpErrorResponse } from '@angular/common/http';

export interface ParsedApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const FALLBACK_MESSAGE = 'Đã có lỗi xảy ra, vui lòng thử lại sau.';

/** Lỗi validate của server trả mảng `{ field, issue }`: hiện lý do cụ thể thay vì câu chung chung. */
function validationMessage(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as { issue?: unknown } | null;
  return typeof first?.issue === 'string' ? first.issue : null;
}

export function parseApiError(error: unknown): ParsedApiError {
  if (error instanceof HttpErrorResponse) {
    const apiError = (
      error.error as { error?: { code?: string; message?: string; details?: unknown } } | null
    )?.error;

    if (apiError?.code) {
      return {
        code: apiError.code,
        message: validationMessage(apiError.details) ?? apiError.message ?? FALLBACK_MESSAGE,
        details:
          apiError.details && typeof apiError.details === 'object' && !Array.isArray(apiError.details)
            ? (apiError.details as Record<string, unknown>)
            : {},
      };
    }

    if (error.status === 0) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Không kết nối được máy chủ. Kiểm tra kết nối hoặc xem server đã chạy chưa.',
        details: {},
      };
    }
  }

  return { code: 'UNKNOWN_ERROR', message: FALLBACK_MESSAGE, details: {} };
}

export function numberFromDetails(error: ParsedApiError, key: string): number | null {
  const value = error.details[key];
  return typeof value === 'number' ? value : null;
}
