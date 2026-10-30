import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import {
  createAddressSchema,
  updateAddressSchema,
  type CreateAddressBody,
  type UpdateAddressBody,
} from './address.schema.js';
import { createAddress, listAddresses, updateAddress } from './address.service.js';

/** Sổ địa chỉ tối thiểu (FR-08) cho thanh toán, mount tại `/users/me/addresses`. */
export const addressRoutes = Router();

addressRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;

addressRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendData(res, await listAddresses(userId(res)));
  }),
);

addressRoutes.post(
  '/',
  validateBody(createAddressSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createAddress(userId(res), res.locals['body'] as CreateAddressBody));
  }),
);

addressRoutes.patch(
  '/:addressId',
  validateBody(updateAddressSchema),
  asyncHandler(async (req, res) => {
    const body = res.locals['body'] as UpdateAddressBody;
    sendData(
      res,
      await updateAddress(userId(res), toObjectId(String(req.params['addressId'])), body),
    );
  }),
);
