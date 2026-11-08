import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  createLayout,
  deleteLayout,
  getLayoutDetail,
  getRoomSuggestions,
  listLayouts,
  updateLayout,
} from './view-room.service.js';
import {
  layoutSchema,
  suggestionSchema,
  type LayoutInput,
  type SuggestionInput,
} from './view-room.schema.js';

export const viewRoomRoutes = Router();

viewRoomRoutes.post(
  '/suggestions',
  validateBody(suggestionSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await getRoomSuggestions(res.locals['body'] as SuggestionInput));
  }),
);

viewRoomRoutes.get(
  '/layouts',
  requireAuth,
  asyncHandler(async (_req, res) => {
    sendData(res, await listLayouts(res.locals['userId'] as string));
  }),
);

viewRoomRoutes.post(
  '/layouts',
  requireAuth,
  validateBody(layoutSchema),
  asyncHandler(async (_req, res) => {
    const layout = await createLayout(
      res.locals['userId'] as string,
      res.locals['body'] as LayoutInput,
    );
    res.status(201);
    sendData(res, layout);
  }),
);

viewRoomRoutes.get(
  '/layouts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendData(res, await getLayoutDetail(res.locals['userId'] as string, String(req.params['id'])));
  }),
);

viewRoomRoutes.put(
  '/layouts/:id',
  requireAuth,
  validateBody(layoutSchema),
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await updateLayout(
        res.locals['userId'] as string,
        String(req.params['id']),
        res.locals['body'] as LayoutInput,
      ),
    );
  }),
);

viewRoomRoutes.delete(
  '/layouts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteLayout(res.locals['userId'] as string, String(req.params['id']));
    sendData(res, { deleted: true });
  }),
);
