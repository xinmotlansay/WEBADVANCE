import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../utils/app-error.js';

/**
 * Lưu file công khai lên Supabase Storage. Database chỉ giữ URL công khai.
 * Cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (chỉ dùng trên server) và bucket công khai
 * tên SUPABASE_STORAGE_BUCKET (mặc định `images`).
 */

let client: SupabaseClient | null = null;

function bucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || 'images';
}

/** Tiền tố URL công khai, ví dụ https://xxx.supabase.co/storage/v1/object/public/images/ ; null nếu chưa cấu hình. */
function publicPrefix(): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return `${base}/storage/v1/object/public/${bucketName()}/`;
}

function storage() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client.storage.from(bucketName());
}

/** URL có phải file đã lưu trên Supabase bucket của hệ thống không (dùng cho validator). */
export function isStoredImageUrl(url: string): boolean {
  const prefix = publicPrefix();
  return prefix !== null && url.startsWith(prefix) && !url.slice(prefix.length).includes('..');
}

/** Upload bytes vào `<folder>/<uuid>.<ext>` và trả về URL công khai. */
export async function uploadPublicFile(
  bytes: Uint8Array,
  options: { folder: string; ext: string; contentType: string },
): Promise<string> {
  const prefix = publicPrefix();
  if (!prefix) throw new Error('Chưa cấu hình Supabase Storage');
  const objectPath = `${options.folder}/${randomUUID()}.${options.ext}`;
  const { error } = await storage().upload(objectPath, bytes, {
    contentType: options.contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new AppError('UPLOAD_FAILED', 502, 'Không lưu được tệp, vui lòng thử lại.', error.message);
  return `${prefix}${objectPath}`;
}

/** Xóa file đã upload theo URL công khai. Bỏ qua URL không thuộc bucket hệ thống. */
export async function deleteStoredFile(url: string): Promise<void> {
  if (!isStoredImageUrl(url)) return;
  const objectPath = decodeURIComponent(url.slice(publicPrefix()!.length));
  const { error } = await storage().remove([objectPath]);
  if (error) throw new Error(`Xóa file Supabase lỗi: ${error.message}`);
}
