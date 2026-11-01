import { z } from 'zod';

export const reportQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'month']).default('30d'),
});
export type ReportPeriod = z.infer<typeof reportQuerySchema>['period'];
