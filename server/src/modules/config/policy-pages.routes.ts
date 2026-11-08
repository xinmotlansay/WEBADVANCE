import { Router } from 'express';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { CONFIG_BY_KEY } from '../super-admin/system-config.registry.js';
import { POLICY_PAGES } from './policy-pages.defaults.js';
import { SystemConfigModel } from './system-config.model.js';

const NUMBER_KEYS = { returnDays: 'policy.returnDays', refundDaysMin: 'policy.refundDaysMin', refundDaysMax: 'policy.refundDaysMax' } as const;

export const policyPagesRoutes = Router();

/** Trang chính sách công khai: nội dung Admin cấp cao nhập, chèn số ngày hiện hành vào các dấu {{...}}. */
policyPagesRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params['slug']);
    const page = POLICY_PAGES.find((p) => p.slug === slug);
    if (!page) throw new AppError('NOT_FOUND', 404, 'Không có trang chính sách này');

    const keys = [`content.${slug}`, ...Object.values(NUMBER_KEYS)];
    const docs = await SystemConfigModel.find({ _id: { $in: keys } }).lean();
    const byKey = new Map(docs.map((d) => [d._id, d.value]));

    const stored = byKey.get(`content.${slug}`) as { title?: string; body?: string } | undefined;
    const title = stored?.title || page.title;
    let body = stored?.body || page.body;
    for (const [name, key] of Object.entries(NUMBER_KEYS)) {
      const value = byKey.get(key) ?? CONFIG_BY_KEY.get(key)?.defaultValue;
      body = body.replaceAll(`{{${name}}}`, String(value));
    }

    sendData(res, { slug, title, paragraphs: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) });
  }),
);
