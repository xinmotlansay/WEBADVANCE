import type { JobDoc } from './job.model.js';

type JobRow = Omit<JobDoc, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date };

/** Dạng trả về chung cho khách và admin. */
export function jobView(j: JobRow) {
  return {
    id: j._id.toString(),
    title: j.title,
    slug: j.slug,
    department: j.department,
    city: j.city,
    type: j.type,
    level: j.level,
    salary: j.salary,
    summary: j.summary,
    responsibilities: j.responsibilities,
    requirements: j.requirements,
    benefits: j.benefits,
    quantity: j.quantity,
    deadline: j.deadline ? j.deadline.toISOString().slice(0, 10) : null,
    displayOrder: j.displayOrder,
    status: j.status,
    postedAt: j.createdAt ? j.createdAt.toISOString() : null,
  };
}
