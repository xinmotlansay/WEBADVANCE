import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import {
  addCartItemSchema,
  cartSelectionSchema,
  updateCartItemSchema,
  type AddCartItemBody,
  type CartSelectionBody,
  type UpdateCartItemBody,
} from './cart.schema.js';
import { addItem, getCart, removeItem, setSelection, updateItem } from './cart.service.js';

export const cartRoutes = Router();

cartRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;

cartRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendData(res, await getCart(userId(res)));
  }),
);

cartRoutes.post(
  '/items',
  validateBody(addCartItemSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await addItem(userId(res), res.locals['body'] as AddCartItemBody));
  }),
);

cartRoutes.patch(
  '/items/:itemId',
  validateBody(updateCartItemSchema),
  asyncHandler(async (req, res) => {
    const body = res.locals['body'] as UpdateCartItemBody;
    sendData(res, await updateItem(userId(res), toObjectId(String(req.params['itemId'])), body));
  }),
);

cartRoutes.delete(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    sendData(res, await removeItem(userId(res), toObjectId(String(req.params['itemId']))));
  }),
);

cartRoutes.patch(
  '/selection',
  validateBody(cartSelectionSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await setSelection(userId(res), res.locals['body'] as CartSelectionBody));
  }),
);
