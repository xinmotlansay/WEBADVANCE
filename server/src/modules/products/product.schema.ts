import { z } from 'zod';

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
);

const objectIdCsv = csv.refine((ids) => ids.every((id) => /^[0-9a-f]{24}$/i.test(id)), {
  message: 'categoryIds phải là danh sách ObjectId cách nhau bởi dấu phẩy',
});

export const productListQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  categoryIds: objectIdCsv.optional(),
  badge: z.enum(['NEW', 'BEST_SELLER']).optional(),
  hasPromotion: z.stringbool().optional(),
  inStock: z.stringbool().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  color: csv.optional(),
  material: csv.optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'name_asc', 'name_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
