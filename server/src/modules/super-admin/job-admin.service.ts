import type { Request } from 'express';
import { AppError } from '../../utils/app-error.js';
import { slugify } from '../../utils/slug.js';
import { JobModel } from '../careers/job.model.js';
import { jobView } from '../careers/job.view.js';
import { recordAudit } from './audit-log.service.js';
import type { JobInput } from './job-admin.schema.js';

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || 'tuyen-dung';
  for (let n = 0; ; n++) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    if (!(await JobModel.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }))) return slug;
  }
}

function toDoc(input: JobInput) {
  return { ...input, deadline: input.deadline ? new Date(`${input.deadline}T00:00:00`) : null };
}

export async function listJobs() {
  return (await JobModel.find().sort({ displayOrder: 1, createdAt: -1 }).lean()).map(jobView);
}

export async function createJob(req: Request, input: JobInput) {
  const created = await JobModel.create({ ...toDoc(input), slug: await uniqueSlug(input.title) });
  const result = jobView(created.toObject());
  await recordAudit(req, { action: 'JOB_CREATE', targetType: 'JOB', targetId: result.id, newValue: result });
  return result;
}

export async function updateJob(req: Request, id: string, input: JobInput) {
  const before = await JobModel.findById(id).lean();
  if (!before) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy vị trí tuyển dụng');
  const slug = input.title === before.title ? before.slug : await uniqueSlug(input.title, id);
  const after = await JobModel.findByIdAndUpdate(id, { $set: { ...toDoc(input), slug } }, { new: true }).lean();
  const result = jobView(after!);
  await recordAudit(req, { action: 'JOB_UPDATE', targetType: 'JOB', targetId: id, oldValue: jobView(before), newValue: result });
  return result;
}

export async function deleteJob(req: Request, id: string) {
  const before = await JobModel.findByIdAndDelete(id).lean();
  if (!before) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy vị trí tuyển dụng');
  await recordAudit(req, { action: 'JOB_DELETE', targetType: 'JOB', targetId: id, oldValue: jobView(before) });
  return { id };
}
