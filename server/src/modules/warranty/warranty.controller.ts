import type { RequestHandler } from 'express';
import { acceptWarranty, getWarranty, listWarranties, rejectWarranty, updateWarrantyStatus } from './warranty.service.js';
import type { RejectWarrantyInput, UpdateWarrantyStatusInput, WarrantyListQuery } from './warranty.schema.js';

const actor = (req: Parameters<RequestHandler>[0]) => ({ userId: req.user!.id, ip: req.ip ?? null });
const id = (req: Parameters<RequestHandler>[0]) => String(req.params['id']);

export const listWarrantiesHandler: RequestHandler = async (_req, res) => {
  const result = await listWarranties(res.locals['query'] as WarrantyListQuery);
  res.json({ success: true, ...result });
};
export const getWarrantyHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await getWarranty(id(req)) });
};
export const acceptWarrantyHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await acceptWarranty(id(req), actor(req)) });
};
export const rejectWarrantyHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await rejectWarranty(id(req), req.body as RejectWarrantyInput, actor(req)) });
};
export const updateWarrantyStatusHandler: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await updateWarrantyStatus(id(req), req.body as UpdateWarrantyStatusInput, actor(req)) });
};
