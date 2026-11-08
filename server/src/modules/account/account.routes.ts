import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import { listMyReviews } from '../reviews/review.service.js';
import {
  changeContactSchema,
  claimWelcomeOfferSchema,
  confirmWelcomeOfferSchema,
  type ClaimWelcomeOfferBody,
  deleteRequestSchema,
  updateProfileSchema,
  walkwayProfileSchema,
  wishlistAddSchema,
  type ChangeContactBody,
  type UpdateProfileBody,
  type WalkwayProfileBody,
} from './account.schema.js';
import {
  addToWishlist,
  changeContact,
  createWalkwayProfile,
  deleteWalkwayProfile,
  getProfile,
  listNewGifts,
  listUserVouchers,
  markGiftsSeen,
  listWalkwayProfiles,
  listWishlist,
  removeFromWishlist,
  requestAccountDeletion,
  setDefaultWalkwayProfile,
  updateProfile,
  updateWalkwayProfile,
  type UserVoucherView,
} from './account.service.js';
import { claimWelcomeOffer, confirmWelcomeOffer, getWelcomeOfferStatus } from './welcome-offer.service.js';

/** Hồ sơ và dữ liệu cá nhân của khách đăng nhập, mount tại `/users/me` (API Design mục 2, 3). */
export const accountRoutes = Router();

accountRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;
const idParam = (value: unknown) => toObjectId(String(value));

accountRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendData(res, await getProfile(userId(res)));
  }),
);

accountRoutes.patch(
  '/',
  validateBody(updateProfileSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await updateProfile(userId(res), res.locals['body'] as UpdateProfileBody));
  }),
);

accountRoutes.put(
  '/contact',
  validateBody(changeContactSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await changeContact(userId(res), res.locals['body'] as ChangeContactBody));
  }),
);

accountRoutes.post(
  '/delete-request',
  validateBody(deleteRequestSchema),
  asyncHandler(async (_req, res) => {
    await requestAccountDeletion(
      userId(res),
      res.locals['body'] as { password?: string; otpId?: string },
    );
    sendData(res, { deleted: true });
  }),
);

accountRoutes.get(
  '/wishlist',
  asyncHandler(async (_req, res) => {
    sendData(res, await listWishlist(userId(res)));
  }),
);

accountRoutes.post(
  '/wishlist',
  validateBody(wishlistAddSchema),
  asyncHandler(async (_req, res) => {
    const { productId } = res.locals['body'] as { productId: string };
    await addToWishlist(userId(res), idParam(productId));
    sendData(res, { wishlisted: true });
  }),
);

accountRoutes.delete(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    await removeFromWishlist(userId(res), idParam(req.params['productId']));
    sendData(res, { wishlisted: false });
  }),
);

accountRoutes.get(
  '/vouchers',
  asyncHandler(async (req, res) => {
    const status = String(req.query['status'] ?? '') as UserVoucherView['status'];
    sendData(
      res,
      await listUserVouchers(
        userId(res),
        ['UNUSED', 'USED', 'EXPIRED'].includes(status) ? status : undefined,
      ),
    );
  }),
);

accountRoutes.get(
  '/vouchers/new',
  asyncHandler(async (_req, res) => {
    sendData(res, await listNewGifts(userId(res)));
  }),
);

accountRoutes.post(
  '/vouchers/seen',
  asyncHandler(async (_req, res) => {
    await markGiftsSeen(userId(res));
    sendData(res, { seen: true });
  }),
);

accountRoutes.get(
  '/reviews',
  asyncHandler(async (_req, res) => {
    sendData(res, await listMyReviews(userId(res)));
  }),
);

accountRoutes.get(
  '/walkway-profiles',
  asyncHandler(async (_req, res) => {
    sendData(res, await listWalkwayProfiles(userId(res)));
  }),
);

accountRoutes.post(
  '/walkway-profiles',
  validateBody(walkwayProfileSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createWalkwayProfile(userId(res), res.locals['body'] as WalkwayProfileBody));
  }),
);

accountRoutes.put(
  '/walkway-profiles/:id',
  validateBody(walkwayProfileSchema),
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await updateWalkwayProfile(userId(res), idParam(req.params['id']), res.locals['body'] as WalkwayProfileBody),
    );
  }),
);

accountRoutes.patch(
  '/walkway-profiles/:id/default',
  asyncHandler(async (req, res) => {
    sendData(res, await setDefaultWalkwayProfile(userId(res), idParam(req.params['id'])));
  }),
);

accountRoutes.delete(
  '/walkway-profiles/:id',
  asyncHandler(async (req, res) => {
    await deleteWalkwayProfile(userId(res), idParam(req.params['id']));
    sendData(res, { deleted: true });
  }),
);

accountRoutes.get(
  '/welcome-offer',
  asyncHandler(async (_req, res) => {
    sendData(res, await getWelcomeOfferStatus(userId(res)));
  }),
);

accountRoutes.post(
  '/welcome-offer/confirm',
  validateBody(confirmWelcomeOfferSchema),
  asyncHandler(async (_req, res) => {
    const { token } = res.locals['body'] as { token: string };
    sendData(res, await confirmWelcomeOffer(userId(res), token));
  }),
);

accountRoutes.post(
  '/welcome-offer/claim',
  validateBody(claimWelcomeOfferSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await claimWelcomeOffer(userId(res), res.locals['body'] as ClaimWelcomeOfferBody));
  }),
);
