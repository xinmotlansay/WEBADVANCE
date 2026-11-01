import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../lib/app-error.js';

const REFUND_PROOF_DIR = path.resolve('private-uploads/refund-proofs');
export const MAX_REFUND_PROOF_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
} as const;

export type RefundProofContentType = keyof typeof EXTENSIONS;

function isRefundProofContentType(value: string): value is RefundProofContentType {
  return value in EXTENSIONS;
}

function matchesSignature(buffer: Buffer, contentType: RefundProofContentType): boolean {
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export function validateRefundProof(
  buffer: Buffer,
  declaredContentType: string,
): RefundProofContentType {
  if (buffer.length > MAX_REFUND_PROOF_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'Tệp chứng từ không được vượt quá 5 MB');
  }
  if (!isRefundProofContentType(declaredContentType)) {
    throw new AppError('UNSUPPORTED_FILE_TYPE', 415, 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc tài liệu PDF');
  }
  if (buffer.length === 0 || !matchesSignature(buffer, declaredContentType)) {
    throw new AppError(
      'UNSUPPORTED_FILE_TYPE',
      415,
      'Nội dung tệp không khớp với định dạng đã chọn',
    );
  }
  return declaredContentType;
}

export async function saveRefundProof(
  buffer: Buffer,
  declaredContentType: string,
): Promise<string> {
  const contentType = validateRefundProof(buffer, declaredContentType);
  const fileName = `${randomUUID()}.${EXTENSIONS[contentType]}`;
  await mkdir(REFUND_PROOF_DIR, { recursive: true });
  await writeFile(path.join(REFUND_PROOF_DIR, fileName), buffer, { flag: 'wx' });
  return fileName;
}

export async function readRefundProof(fileName: string): Promise<{
  buffer: Buffer;
  contentType: RefundProofContentType;
}> {
  const match =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|pdf)$/i.exec(
      fileName,
    );
  if (!match) {
    throw new AppError('FILE_NOT_FOUND', 404, 'Không tìm thấy chứng từ');
  }

  const extension = match[2].toLowerCase();
  const contentType =
    extension === 'jpg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : 'application/pdf';
  try {
    return { buffer: await readFile(path.join(REFUND_PROOF_DIR, fileName)), contentType };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new AppError('FILE_NOT_FOUND', 404, 'Không tìm thấy chứng từ');
    }
    throw error;
  }
}
