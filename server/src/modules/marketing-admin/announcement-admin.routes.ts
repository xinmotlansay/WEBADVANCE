import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  announcementInputSchema,
  announcementListQuerySchema,
  announcementUpdateSchema,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  reorderAnnouncements,
  setAnnouncementHidden,
  updateAnnouncement,
  type AnnouncementInput,
  type AnnouncementListQuery,
  type AnnouncementUpdate,
} from './announcement-admin.service.js';

/** `/api/v1/admin/marketing/announcements`: quyền đã kiểm ở router cha. */
export const announcementAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }) => String(res.locals['userId']);
const id = (p: { id?: string | string[] }) => String(p.id);
const publishSchema = z.object({ publishAt: z.iso.datetime().optional() });
const reorderSchema = z.object({ ids: z.array(z.string()).min(1).max(200) });

announcementAdminRoutes.get(
  '/',
  validateQuery(announcementListQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listAnnouncements(res.locals['query'] as AnnouncementListQuery))),
);

announcementAdminRoutes.post(
  '/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (_req, res) => sendData(res, await reorderAnnouncements(actor(res), (res.locals['body'] as { ids: string[] }).ids))),
);

announcementAdminRoutes.post(
  '/',
  validateBody(announcementInputSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createAnnouncement(actor(res), res.locals['body'] as AnnouncementInput));
  }),
);

announcementAdminRoutes.get('/:id', asyncHandler(async (req, res) => sendData(res, await getAnnouncement(id(req.params)))));

announcementAdminRoutes.patch(
  '/:id',
  validateBody(announcementUpdateSchema),
  asyncHandler(async (req, res) => sendData(res, await updateAnnouncement(actor(res), id(req.params), res.locals['body'] as AnnouncementUpdate))),
);

announcementAdminRoutes.post(
  '/:id/publish',
  validateBody(publishSchema),
  asyncHandler(async (req, res) => {
    const { publishAt } = res.locals['body'] as { publishAt?: string };
    sendData(res, await publishAnnouncement(actor(res), id(req.params), publishAt ? new Date(publishAt) : undefined));
  }),
);

announcementAdminRoutes.post('/:id/hide', asyncHandler(async (req, res) => sendData(res, await setAnnouncementHidden(actor(res), id(req.params), true))));
announcementAdminRoutes.post('/:id/show', asyncHandler(async (req, res) => sendData(res, await setAnnouncementHidden(actor(res), id(req.params), false))));
announcementAdminRoutes.delete('/:id', asyncHandler(async (req, res) => sendData(res, await deleteAnnouncement(actor(res), id(req.params)))));
