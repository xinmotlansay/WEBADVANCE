import { parseApiError } from './auth/auth-error';

/** Thông điệp lỗi API hiển thị cho người dùng (dùng chung `parseApiError`). */
export function apiErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}
