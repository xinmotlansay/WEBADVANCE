import type { RequestHandler } from 'express';
import { getOrderDashboardSummary, getOrderReport } from './dashboard.service.js';
import type { ReportPeriod } from './dashboard.schema.js';

export const getOrderDashboardHandler: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await getOrderDashboardSummary() });
};
export const getOrderReportHandler: RequestHandler = async (_req, res) => {
  const query = res.locals['query'] as { period: ReportPeriod };
  res.json({ success: true, data: await getOrderReport(query.period) });
};
