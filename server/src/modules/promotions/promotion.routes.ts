import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { getFlashSale } from './flash-sale.service.js';

export const promotionRoutes = Router();

promotionRoutes.get(
  '/flash-sale',
  asyncHandler(async (_req, res) => {
    sendData(res, await getFlashSale());
  }),
);
