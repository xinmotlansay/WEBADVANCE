import { Router } from 'express';
import { RoleName } from '../../lib/shared-enums.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { announcementAdminRoutes } from './announcement-admin.routes.js';
import { articleAdminRoutes } from './article-admin.routes.js';
import { bannerAdminRoutes } from './banner-admin.routes.js';
import { collectionAdminRoutes } from './collection-admin.routes.js';
import { contentAdminRoutes } from './content-admin.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { insightsRoutes } from './insights.routes.js';
import { inspirationAdminRoutes } from './inspiration-admin.routes.js';
import { promotionAdminRoutes } from './promotion-admin.routes.js';
import { scheduleRoutes } from './schedule.routes.js';
import { voucherAdminRoutes } from './voucher-admin.routes.js';

/** Router cha `/api/admin/marketing`: kiểm tra đăng nhập + vai trò một lần cho mọi route con. */
export const marketingAdminRoutes = Router();

marketingAdminRoutes.use(requireAuth, requireRole(RoleName.MARKETING_ADMIN, RoleName.SUPER_ADMIN));
marketingAdminRoutes.use('/dashboard', dashboardRoutes);
marketingAdminRoutes.use('/vouchers', voucherAdminRoutes);
marketingAdminRoutes.use('/promotions', promotionAdminRoutes);
marketingAdminRoutes.use('/insights', insightsRoutes);
marketingAdminRoutes.use('/banners', bannerAdminRoutes);
marketingAdminRoutes.use('/articles', articleAdminRoutes);
marketingAdminRoutes.use('/content', contentAdminRoutes);
marketingAdminRoutes.use('/collections', collectionAdminRoutes);
marketingAdminRoutes.use('/inspirations', inspirationAdminRoutes);
marketingAdminRoutes.use('/schedule', scheduleRoutes);
marketingAdminRoutes.use('/announcements', announcementAdminRoutes);
