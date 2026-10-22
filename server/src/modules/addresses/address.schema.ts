import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max);

export const createAddressSchema = z.object({
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
});

export const updateAddressSchema = createAddressSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Không có thay đổi nào' });

export type CreateAddressBody = z.infer<typeof createAddressSchema>;
export type UpdateAddressBody = z.infer<typeof updateAddressSchema>;
