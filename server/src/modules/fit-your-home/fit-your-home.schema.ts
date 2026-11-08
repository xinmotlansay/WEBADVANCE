import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Mã không hợp lệ');
const cm = z.number().min(20, 'Tối thiểu 20 cm').max(1000, 'Tối đa 1000 cm');

export const passageSchema = z
  .object({
    type: z.enum(['DOOR', 'ELEVATOR', 'STAIRS', 'HALLWAY']),
    label: z.string().trim().max(50).optional(),
    width: cm,
    height: cm,
    length: cm.optional(),
    cabinLength: cm.optional(),
    cabinWidth: cm.optional(),
    cabinHeight: cm.optional(),
    loadCapacityKg: z.number().positive().max(10000).optional(),
  })
  .refine((p) => p.type !== 'ELEVATOR' || (p.cabinLength && p.cabinWidth && p.cabinHeight), {
    message: 'Thang máy cần đủ chiều rộng, sâu và cao của cabin',
    path: ['cabinLength'],
  });

// ponytail: chưa nhận `walkwayProfileId` (cần đăng nhập), thêm khi có module auth.
export const fitCheckBodySchema = z.object({
  productId: objectId,
  variantId: objectId.optional(),
  passages: z.array(passageSchema).min(1).max(10),
});

export const fitSimilarBodySchema = fitCheckBodySchema.extend({
  includeCaution: z.boolean().default(false),
});

export type FitCheckBody = z.infer<typeof fitCheckBodySchema>;
export type FitSimilarBody = z.infer<typeof fitSimilarBodySchema>;
