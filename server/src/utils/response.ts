import type { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendData<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

export function sendPage<T>(res: Response, data: T[], meta: PageMeta): void {
  res.json({ success: true, data, meta });
}
