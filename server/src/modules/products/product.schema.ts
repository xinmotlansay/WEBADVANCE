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

export const productListQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    collection: z.string().trim().max(120).optional(),
    ids: objectIdCsv.optional(),
    categoryIds: objectIdCsv.optional(),
    /** Slug danh mục, ví dụ `phong-ngu`; dùng cho liên kết banner thay vì ID. */
    categorySlug: z.string().trim().max(120).optional(),
    badge: z.enum(['NEW', 'BEST_SELLER']).optional(),
    hasPromotion: z.stringbool().optional(),
    inStock: z.stringbool().optional(),
    /** Chỉ lấy sản phẩm có mô hình 3D (dùng cho View your Room). */
    has3DModel: z.stringbool().optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    color: csv.optional(),
    material: csv.optional(),
    minLength: z.coerce.number().min(0).optional(),
    maxLength: z.coerce.number().min(0).optional(),
    minWidth: z.coerce.number().min(0).optional(),
    maxWidth: z.coerce.number().min(0).optional(),
    minHeight: z.coerce.number().min(0).optional(),
    maxHeight: z.coerce.number().min(0).optional(),
    sort: z.enum(['price_asc', 'price_desc', 'newest', 'name_asc', 'name_desc']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((q, ctx) => {
    for (const [min, max] of [
      ['minPrice', 'maxPrice'],
      ['minLength', 'maxLength'],
      ['minWidth', 'maxWidth'],
      ['minHeight', 'maxHeight'],
    ] as const) {
      if (q[min] !== undefined && q[max] !== undefined && q[min]! > q[max]!)
        ctx.addIssue({
          code: 'custom',
          path: [max],
          message: 'Giá trị đến phải lớn hơn hoặc bằng giá trị từ',
        });
    }
  });

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
