import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { requireCustomer } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart, detectFile } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { UploadedFileModel } from './after-sales.model.js';
import type { UserDoc } from '../auth/auth.model.js';
export const uploadRoutes = Router();
uploadRoutes.post(
  '/',
  requireCustomer,
  raw({ type: 'multipart/form-data', limit: '51mb' }),
  asyncHandler(async (req, res) => {
    const form = await readMultipart(req),
      file = form.get('file'),
      purpose = form.get('purpose');
    if (
      !(file instanceof File) ||
      !['WARRANTY_EVIDENCE', 'RETURN_EVIDENCE'].includes(String(purpose))
    )
      throw new AppError('VALIDATION_ERROR', 400, 'File hoặc mục đích upload không hợp lệ');
    const bytes = new Uint8Array(await file.arrayBuffer()),
      format = detectFile(bytes);
    if (bytes.length > (format.video ? 50 : 5) * 1024 * 1024)
      throw new AppError(
        'FILE_TOO_LARGE',
        413,
        format.video ? 'Video tối đa 50 MB' : 'Ảnh tối đa 5 MB',
      );
    const name = `${randomUUID()}.${format.ext}`,
      url = `/uploads/evidence/${name}`,
      directory = path.resolve('uploads/evidence');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), bytes, { flag: 'wx' });
    try {
      await UploadedFileModel.create({
        _id: name,
        userId: (res.locals['user'] as UserDoc)._id,
        purpose: String(purpose),
        url,
        mime: format.mime,
        size: bytes.length,
        createdAt: new Date(),
      });
    } catch (error) {
      await unlink(path.join(directory, name));
      throw error;
    }
    res.status(201);
    sendData(res, { url, format: format.ext.toUpperCase(), size: bytes.length });
  }),
);
