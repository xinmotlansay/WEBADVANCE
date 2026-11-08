import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { checkoutPreviewSchema, type CheckoutBody } from './checkout.schema.js';
import { buildCheckout } from './checkout.service.js';

export const checkoutRoutes = Router();

checkoutRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;

checkoutRoutes.post(
  '/preview',
  validateBody(checkoutPreviewSchema),
  asyncHandler(async (_req, res) => {
    const { preview } = await buildCheckout(userId(res), res.locals['body'] as CheckoutBody);
    sendData(res, preview);
  }),
);
