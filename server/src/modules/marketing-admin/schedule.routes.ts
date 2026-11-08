import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  cancelSchedule,
  listSchedule,
  reschedule,
  scheduleQuerySchema,
  type ScheduleQuery,
  type ScheduleType,
} from './schedule.service.js';

/** `/api/v1/admin/marketing/schedule`: quyền đã kiểm ở router cha. */
export const scheduleRoutes = Router();

const typeSchema = z.enum(['BANNER', 'COLLECTION', 'INSPIRATION', 'ANNOUNCEMENT']);
const actor = (res: { locals: Record<string, unknown> }) => String(res.locals['userId']);

scheduleRoutes.get(
  '/',
  validateQuery(scheduleQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listSchedule(res.locals['query'] as ScheduleQuery))),
);

scheduleRoutes.post(
  '/:type/:id/reschedule',
  validateBody(z.object({ publishAt: z.iso.datetime() })),
  asyncHandler(async (req, res) => {
    const type = typeSchema.parse(req.params['type']) as ScheduleType;
    const { publishAt } = res.locals['body'] as { publishAt: string };
    sendData(res, await reschedule(actor(res), type, String(req.params['id']), publishAt));
  }),
);

scheduleRoutes.post(
  '/:type/:id/cancel',
  asyncHandler(async (req, res) => {
    const type = typeSchema.parse(req.params['type']) as ScheduleType;
    sendData(res, await cancelSchedule(actor(res), type, String(req.params['id'])));
  }),
);
