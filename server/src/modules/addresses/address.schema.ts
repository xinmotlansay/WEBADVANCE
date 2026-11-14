import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max);

const coord = {
  latitude: z.coerce.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional().default(null),
};

/**
 * Object thuần (chưa refine) để nơi khác có thể `.omit()`/`.extend()` rồi tự áp refinement.
 * Lưu ý: trong Zod v4 không thể `.omit()` trên schema đã có refinement.
 */
export const addressInputSchema = z.object({
  recipientName: text(100),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
  addressLine: text(200),
  ward: text(100),
  district: z.string().trim().max(100).optional(),
  province: text(100),
  isDefault: z.boolean().default(false),
  ...coord,
});

/** Bắt buộc gửi đủ cả kinh độ và vĩ độ (hoặc bỏ hẳn cả hai). */
export function refineCoords(
  body: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
): void {
  const hasLat = body.latitude != null;
  const hasLng = body.longitude != null;
  if (hasLat !== hasLng) {
    ctx.addIssue({ code: 'custom', message: 'Cần gửi đủ cả kinh độ và vĩ độ' });
  }
}

export const createAddressSchema = addressInputSchema.superRefine(refineCoords);

export const updateAddressSchema = z
  .object({
    recipientName: text(100),
    recipientPhone: z
      .string()
      .trim()
      .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
    addressLine: text(200),
    ward: text(100),
    district: z.string().trim().max(100).optional(),
    province: text(100),
    isDefault: z.boolean(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  })
  .partial()
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Không có thay đổi nào' });
    }
    const hasLat = body.latitude !== undefined;
    const hasLng = body.longitude !== undefined;
    if (hasLat !== hasLng) {
      ctx.addIssue({ code: 'custom', message: 'Cần gửi đủ cả kinh độ và vĩ độ' });
    }
  });

export type CreateAddressBody = z.infer<typeof createAddressSchema>;
export type UpdateAddressBody = z.infer<typeof updateAddressSchema>;
