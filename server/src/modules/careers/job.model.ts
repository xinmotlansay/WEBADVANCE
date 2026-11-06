import { Schema, model, type Types } from 'mongoose';

export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'INTERN'] as const;
export const JOB_LEVELS = ['INTERN', 'JUNIOR', 'SENIOR', 'MANAGER'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobLevel = (typeof JOB_LEVELS)[number];

export interface JobDoc {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  department: string;
  city: string;
  type: JobType;
  level: JobLevel;
  /** Hiển thị nguyên văn, vd. "15 – 25 triệu" hoặc "Thỏa thuận". */
  salary: string;
  summary: string;
  /** Mỗi dòng một ý. */
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  quantity: number;
  deadline: Date | null;
  displayOrder: number;
  status: 'OPEN' | 'CLOSED' | 'HIDDEN';
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<JobDoc>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    department: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: JOB_TYPES, default: 'FULL_TIME' },
    level: { type: String, required: true, enum: JOB_LEVELS, default: 'JUNIOR' },
    salary: { type: String, default: 'Thỏa thuận' },
    summary: { type: String, default: '' },
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    benefits: { type: [String], default: [] },
    quantity: { type: Number, default: 1, min: 1 },
    deadline: { type: Date, default: null },
    displayOrder: { type: Number, default: 0 },
    status: { type: String, required: true, enum: ['OPEN', 'CLOSED', 'HIDDEN'], default: 'OPEN' },
  },
  { timestamps: true },
);

export const JobModel = model<JobDoc>('jobs', jobSchema);
