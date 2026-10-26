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

export interface ApiPageResponse<T> {
  success: true;
  data: T[];
  meta: PageMeta;
}
