import { z } from 'zod';

export const customerIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Mã khách hàng không hợp lệ'),
});
export const customerListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
