export type JobType = 'FULL_TIME' | 'PART_TIME' | 'INTERN';
export type JobLevel = 'INTERN' | 'JUNIOR' | 'SENIOR' | 'MANAGER';

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  INTERN: 'Thực tập',
};

export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  INTERN: 'Thực tập sinh',
  JUNIOR: 'Nhân viên',
  SENIOR: 'Chuyên viên cao cấp',
  MANAGER: 'Quản lý',
};

export interface Job {
  id: string;
  title: string;
  slug: string;
  department: string;
  city: string;
  type: JobType;
  level: JobLevel;
  salary: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  quantity: number;
  /** yyyy-MM-dd; null khi không giới hạn. */
  deadline: string | null;
  postedAt: string | null;
}

export interface JobListQuery {
  q?: string;
  department?: string;
  city?: string;
  type?: JobType;
  level?: JobLevel;
}

export interface JobListResult {
  jobs: Job[];
  filters: { departments: string[]; cities: string[] };
}
