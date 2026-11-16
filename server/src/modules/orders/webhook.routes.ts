import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { config } from '../../config/index.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { handleBankTransfer } from './bank-transfer.service.js';
import { bankTransferSchema, type BankTransferBody } from './order.schema.js';
import { sepayToBankTransfer, sepayWebhookSchema, type SepayWebhookBody } from './sepay.js';

export const webhookRoutes = Router();

/** SePay gửi `Authorization: Apikey <SEPAY_API_KEY>`; chưa cấu hình thì từ chối hết. */
const requireSepayKey: RequestHandler = (req, _res, next) => {
  const expected = Buffer.from(`Apikey ${config.sepayApiKey}`);
  const actual = Buffer.from(req.get('Authorization') ?? '');
  const ok =
    config.sepayApiKey.length > 0 &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected);
  next(ok ? undefined : new AppError('UNAUTHORIZED', 401, 'Sai API Key SePay'));
};

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

/**
 * Webhook SePay. Tiền ra và payload không đọc được được trả 200 để SePay không gửi lại;
 * tiền vào được đối chiếu như chuyển khoản thường.
 */
webhookRoutes.post(
  '/sepay',
  requireSepayKey,
  validateBody(sepayWebhookSchema),
  asyncHandler(async (_req, res) => {
    const event = sepayToBankTransfer(res.locals['body'] as SepayWebhookBody);
    if (!event) {
      sendData(res, { ignored: true });
      return;
    }
    sendData(res, await handleBankTransfer(event));
  }),
);
