import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { config } from '../../config/index.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { handleBankTransfer } from './bank-transfer.service.js';
import { bankTransferSchema, type BankTransferBody } from './order.schema.js';
import { fromSepay, sepayWebhookSchema, type SepayWebhookBody } from './sepay.js';

export const webhookRoutes = Router();

/** So sánh hằng thời gian; secret chưa cấu hình thì luôn sai. */
function secretMatches(expected: string, actual: string | undefined): boolean {
  const e = Buffer.from(expected);
  const a = Buffer.from(actual ?? '');
  return e.length > 0 && a.length === e.length && timingSafeEqual(a, e);
}

const unauthorized = () => new AppError('UNAUTHORIZED', 401, 'Sai chữ ký webhook');

/** Ngân hàng mô phỏng gửi `X-Webhook-Secret` bằng `BANK_WEBHOOK_SECRET`; chưa cấu hình thì từ chối hết. */
const requireBankSecret: RequestHandler = (req, _res, next) => {
  next(
    secretMatches(config.bankWebhookSecret, req.get('X-Webhook-Secret'))
      ? undefined
      : unauthorized(),
  );
};

/** SePay xác thực bằng API Key: header `Authorization: Apikey <SEPAY_API_KEY>`; chưa cấu hình thì từ chối hết. */
const requireSepayKey: RequestHandler = (req, _res, next) => {
  const ok =
    !!config.sepayApiKey && secretMatches(`Apikey ${config.sepayApiKey}`, req.get('Authorization'));
  next(ok ? undefined : unauthorized());
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

/** SePay chỉ coi là thành công khi nhận đúng `{"success": true}` (200/201), nếu không sẽ gửi lại. */
webhookRoutes.post(
  '/sepay',
  requireSepayKey,
  validateBody(sepayWebhookSchema),
  asyncHandler(async (_req, res) => {
    const event = fromSepay(res.locals['body'] as SepayWebhookBody);
    if (event) await handleBankTransfer(event);
    res.json({ success: true });
  }),
);
