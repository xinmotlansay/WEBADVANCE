import { Router } from 'express';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import {
  createVoucherSchema,
  disableSchema,
  enableSchema,
  updateVoucherSchema,
} from './voucher-admin.rules.js';
import {
  createVoucher,
  disableVouchers,
  enableVoucher,
  getVoucher,
  listQuerySchema,
  listVouchers,
  updateVoucher,
  type ListQuery,
} from './voucher-admin.service.js';

/** `/api/v1/admin/marketing/vouchers`: quyền đã kiểm ở router cha. */
export const voucherAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);

voucherAdminRoutes.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => {
    const { data, meta } = await listVouchers(res.locals['query'] as ListQuery);
    sendPage(res, data, meta);
  }),
);

voucherAdminRoutes.post(
  '/',
  validateBody(createVoucherSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createVoucher(actor(res), res.locals['body']));
  }),
);

// Phải đứng trước `/:id` để "disable" không bị coi là id.
voucherAdminRoutes.post(
  '/disable',
  validateBody(disableSchema),
  asyncHandler(async (_req, res) => {
    const b = res.locals['body'] as { ids: string[]; reason: never; note?: string };
    sendData(res, await disableVouchers(actor(res), b.ids, b.reason, b.note));
  }),
);

voucherAdminRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await getVoucher(id(req.params)))),
);

voucherAdminRoutes.patch(
  '/:id',
  validateBody(updateVoucherSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updateVoucher(actor(res), id(req.params), res.locals['body'])),
  ),
);

voucherAdminRoutes.post(
  '/:id/enable',
  validateBody(enableSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await enableVoucher(actor(res), id(req.params), res.locals['body'].reason)),
  ),
);
