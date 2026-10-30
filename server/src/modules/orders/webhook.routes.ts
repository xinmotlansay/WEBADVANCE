import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { config } from '../../config/index.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { handleBankTransfer } from './bank-transfer.service.js';
import { bankTransferSchema, type BankTransferBody } from './order.schema.js';

export const webhookRoutes = Router();

/** Ngân hàng mô phỏng gửi `X-Webhook-Secret` bằng `BANK_WEBHOOK_SECRET`; chưa cấu hình thì từ chối hết. */
const requireBankSecret: RequestHandler = (req, _res, next) => {
  const expected = Buffer.from(config.bankWebhookSecret);
  const actual = Buffer.from(req.get('X-Webhook-Secret') ?? '');
  const ok =
    expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
  next(ok ? undefined : new AppError('UNAUTHORIZED', 401, 'Sai chữ ký webhook'));
};

/** Luôn trả 200 khi đã nhận để nhà cung cấp không gửi lại (API Design 8.4). */
webhookRoutes.post(
  '/bank-transfer',
  requireBankSecret,
  validateBody(bankTransferSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await handleBankTransfer(res.locals['body'] as BankTransferBody));
  }),
);
