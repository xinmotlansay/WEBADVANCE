import type { RequestHandler } from 'express';
import {
  completeRefund,
  listPaymentExceptions,
  listPendingRefunds,
  startRefund,
  listPayments,
  resolvePayment,
} from './payment.service.js';
import type {
  CompleteRefundInput,
  PaymentListQueryInput,
  ResolvePaymentInput,
  StartRefundInput,
} from './payment.schema.js';

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

export const listPendingRefundsHandler: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await listPendingRefunds() });
};

export const completeRefundHandler: RequestHandler = async (req, res) => {
  const body = req.body as CompleteRefundInput;
  res.json({
    success: true,
    data: await completeRefund(String(req.params['transactionId']), body, {
      userId: req.user!.id,
      ip: req.ip ?? null,
    }),
  });
};

export const startRefundHandler: RequestHandler = async (req, res) => {
  const body = req.body as StartRefundInput;
  res.json({
    success: true,
    data: await startRefund(String(req.params['transactionId']), body, {
      userId: req.user!.id,
      ip: req.ip ?? null,
    }),
  });
};
