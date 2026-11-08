import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { logAdminAction } from './admin-log.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import {
  campaignReport,
  createSegmentVoucher,
  previewSegmentVoucher,
  segmentVoucherSchema,
  voucherPreviewSchema,
  type SegmentVoucherInput,
} from './insights-campaign.service.js';
import { getInsights } from './insights.service.js';
import { requestRescore } from './ml-client.js';

/** `/api/v1/admin/marketing/insights`: chỉ số tổng hợp theo phân khúc, không có danh tính khách. */
export const insightsRoutes = Router();

insightsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => sendData(res, await getInsights())),
);

insightsRoutes.post(
  '/rescore',
  asyncHandler(async (_req, res) => {
    const result = await requestRescore();
    logAdminAction(String(res.locals['userId']), 'INSIGHTS_RESCORE', 'customer_scores', { ...result });
    sendData(res, result);
  }),
);

/** Xem trước số người nhận và số đối chứng ở một mức giảm (quy tắc ô Giữ ngay và net > 0). */
insightsRoutes.get(
  '/retain-voucher/preview',
  validateQuery(voucherPreviewSchema),
  asyncHandler(async (_req, res) => {
    const { discountPercent, saveRate } = res.locals['query'] as { discountPercent: number; saveRate?: number };
    sendData(res, await previewSegmentVoucher(discountPercent, saveRate));
  }),
);

/** Tạo voucher cho khách ô Giữ ngay có net > 0: trả số lượng người nhận, không có danh tính. */
insightsRoutes.post(
  '/retain-voucher',
  validateBody(segmentVoucherSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createSegmentVoucher(String(res.locals['userId']), res.locals['body'] as SegmentVoucherInput));
  }),
);

insightsRoutes.get(
  '/campaigns',
  asyncHandler(async (_req, res) => sendData(res, await campaignReport())),
);
