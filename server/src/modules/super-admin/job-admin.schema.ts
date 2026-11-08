import { z } from 'zod';
import { JOB_LEVELS, JOB_TYPES } from '../careers/job.model.js';

const lines = z.array(z.string().trim().min(1).max(300)).max(20);

export const jobSchema = z.object({
  title: z.string().trim().min(3, 'Tên vị trí tối thiểu 3 ký tự').max(120),
  department: z.string().trim().min(1, 'Nhập phòng ban').max(60),
  city: z.string().trim().min(1, 'Nhập nơi làm việc').max(60),
  type: z.enum(JOB_TYPES),
  level: z.enum(JOB_LEVELS),
  salary: z.string().trim().max(60).default('Thỏa thuận'),
  summary: z.string().trim().max(500).default(''),
  responsibilities: lines.default([]),
  requirements: lines.default([]),
  benefits: lines.default([]),
  quantity: z.number().int().min(1).max(999).default(1),
  deadline: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn dạng YYYY-MM-DD'), z.literal(''), z.null()]).default(null),
  displayOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(['OPEN', 'CLOSED', 'HIDDEN']).default('OPEN'),
});

export type JobInput = z.infer<typeof jobSchema>;
