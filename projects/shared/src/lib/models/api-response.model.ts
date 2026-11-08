export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** Body lỗi chuẩn (API Design 0.3, 0.4). */
export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface ApiPageResponse<T> {
  success: true;
  data: T[];
  meta: PageMeta;
}
