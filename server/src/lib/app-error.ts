// Dùng chung một AppError với phần còn lại của server (`utils/app-error.ts`).
export { AppError } from '../utils/app-error.js';
import { AppError } from '../utils/app-error.js';

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
