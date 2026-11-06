import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { JOB_LEVELS, JOB_TYPES, JobModel } from './job.model.js';
import { jobView } from './job.view.js';

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  department: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  type: z.enum(JOB_TYPES).optional(),
  level: z.enum(JOB_LEVELS).optional(),
});

/** Tin đang mở và chưa quá hạn nhận hồ sơ. */
function visibleNow() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { status: 'OPEN' as const, $or: [{ deadline: null }, { deadline: { $gte: today } }] };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const careerRoutes = Router();

/** Danh sách tin kèm các giá trị bộ lọc có thật (lấy từ toàn bộ tin đang mở, không phụ thuộc bộ lọc đang chọn). */
careerRoutes.get(
  '/jobs',
  validateQuery(querySchema),
  asyncHandler(async (_req, res) => {
    const { q, department, city, type, level } = res.locals['query'] as z.infer<typeof querySchema>;
    const base = visibleNow();
    const filter = {
      ...base,
      ...(department ? { department } : {}),
      ...(city ? { city } : {}),
      ...(type ? { type } : {}),
      ...(level ? { level } : {}),
      ...(q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {}),
    };

    const [jobs, departments, cities] = await Promise.all([
      JobModel.find(filter).sort({ displayOrder: 1, createdAt: -1 }).lean(),
      JobModel.distinct('department', base),
      JobModel.distinct('city', base),
    ]);

    sendData(res, {
      jobs: jobs.map(jobView),
      filters: { departments: departments.sort(), cities: cities.sort() },
    });
  }),
);

careerRoutes.get(
  '/jobs/:slug',
  asyncHandler(async (req, res) => {
    const job = await JobModel.findOne({ slug: String(req.params['slug']), ...visibleNow() }).lean();
    if (!job) throw new AppError('NOT_FOUND', 404, 'Vị trí này không còn nhận hồ sơ');
    sendData(res, jobView(job));
  }),
);
