import type { RequestHandler } from 'express';
import {
  listPaymentExceptions,
  listPayments,
  resolvePayment,
} from './payment.service.js';
import type { PaymentListQueryInput, ResolvePaymentInput } from './payment.schema.js';

export const listPaymentsHandler: RequestHandler = async (_req, res) => {
  const query = res.locals['query'] as PaymentListQueryInput;
  const result = await listPayments(query);
  res.json({ success: true, data: result.data, meta: result.meta });
};

export const listPaymentExceptionsHandler: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await listPaymentExceptions() });
};

export const resolvePaymentHandler: RequestHandler = async (req, res) => {
  const body = req.body as ResolvePaymentInput;
  res.json({
    success: true,
    data: await resolvePayment(String(req.params['transactionId']), body, {
      userId: req.user!.id,
      ip: req.ip ?? null,
    }),
  });
};
