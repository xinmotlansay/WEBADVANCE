import express, { Router } from 'express';
import { RoleName } from '../../lib/shared-enums.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { AppError } from '../../lib/app-error.js';
import { readRefundProof, saveRefundProof } from './refund-proof.service.js';

const refundProofsRouter = Router();
const adminRoles = [RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN];

refundProofsRouter.use(requireAuth, requireRole(...adminRoles));
refundProofsRouter.post(
  '/refund-proofs',
  express.raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        415,
        'Vui lòng chọn ảnh JPEG, PNG hoặc tài liệu PDF',
      );
    }
    const contentType = req.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
    const fileName = await saveRefundProof(req.body, contentType);
    res.status(201).json({
      success: true,
      data: { url: `/api/v1/admin/uploads/refund-proofs/${fileName}` },
    });
  }),
);
refundProofsRouter.get(
  '/refund-proofs/:fileName',
  asyncHandler(async (req, res) => {
    const fileName = String(req.params['fileName']);
    const file = await readRefundProof(fileName);
    res.type(file.contentType).attachment(fileName).send(file.buffer);
  }),
);

export const adminUploadRouter = Router();
adminUploadRouter.use('/uploads', refundProofsRouter);
