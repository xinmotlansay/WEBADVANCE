import type { RequestHandler } from 'express';
import {
  completeReturn,
  confirmReturn,
  getReturn,
  listReturns,
  receiveReturn,
  refundReturn,
  rejectReturn,
  updateReturn,
} from './return.service.js';
import type {
  ReceiveReturnInput,
  RefundReturnInput,
  RejectReturnInput,
  ReturnListQuery,
  UpdateReturnInput,
} from './return.schema.js';

const actor = (req: Parameters<RequestHandler>[0]) => ({ userId: req.user!.id, ip: req.ip ?? null });
const id = (req: Parameters<RequestHandler>[0]) => String(req.params['id']);

export const listReturnsHandler: RequestHandler = async (_req, res) => {
  const result = await listReturns(res.locals['query'] as ReturnListQuery);
  res.json({ success: true, ...result });
};
export const getReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await getReturn(id(req)) });
};
export const confirmReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await confirmReturn(id(req), actor(req)) });
};
export const rejectReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await rejectReturn(id(req), req.body as RejectReturnInput, actor(req)) });
};
export const updateReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await updateReturn(id(req), req.body as UpdateReturnInput, actor(req)) });
};
export const receiveReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await receiveReturn(id(req), req.body as ReceiveReturnInput, actor(req)) });
};
export const refundReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await refundReturn(id(req), req.body as RefundReturnInput, actor(req)) });
};
export const completeReturnHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await completeReturn(id(req), actor(req)) });
};
