import type { Request } from 'express';
import { AppError } from './app-error.js';

export async function readMultipart(req: Request): Promise<FormData> {
  if (!Buffer.isBuffer(req.body))
    throw new AppError('VALIDATION_ERROR', 400, 'Cần gửi file bằng multipart/form-data');
  try {
    return await new Response(new Uint8Array(req.body), {
      headers: { 'Content-Type': req.headers['content-type'] ?? '' },
    }).formData();
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, 'Dữ liệu upload không hợp lệ');
  }
}

export function detectFile(bytes: Uint8Array): { mime: string; ext: string; video: boolean } {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { mime: 'image/jpeg', ext: 'jpg', video: false };
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png', ext: 'png', video: false };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', video: false };
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'qt  '].includes(brand))
      return {
        mime: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4',
        ext: brand === 'qt  ' ? 'mov' : 'mp4',
        video: true,
      };
  }
  throw new AppError(
    'UNSUPPORTED_FILE_TYPE',
    415,
    'Chỉ nhận ảnh JPG, PNG, WebP hoặc video MP4, MOV',
  );
}
