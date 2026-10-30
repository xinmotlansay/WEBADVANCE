import { Router } from 'express';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  fitCheckBodySchema,
  fitSimilarBodySchema,
  type FitCheckBody,
  type FitSimilarBody,
} from './fit-your-home.schema.js';
import { checkProductFit, findSimilarFit } from './fit-your-home.service.js';

export const fitYourHomeRoutes = Router();

fitYourHomeRoutes.post(
  '/check',
  validateBody(fitCheckBodySchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await checkProductFit(res.locals['body'] as FitCheckBody));
  }),
);

fitYourHomeRoutes.post(
  '/similar',
  validateBody(fitSimilarBodySchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await findSimilarFit(res.locals['body'] as FitSimilarBody));
  }),
);
