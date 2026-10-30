import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Mã không hợp lệ');
const quantity = z.number().int().min(1, 'Số lượng tối thiểu là 1').max(999);
const note = z.string().trim().max(500);

export const addCartItemSchema = z.object({
  variantId: objectId,
  quantity: quantity.default(1),
  hasInstallation: z.boolean().default(false),
  note: note.optional(),
});

export const updateCartItemSchema = z
  .object({
    quantity: quantity.optional(),
    variantId: objectId.optional(),
    isSelected: z.boolean().optional(),
    hasInstallation: z.boolean().optional(),
    note: note.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Không có thay đổi nào' });

/** Bỏ `itemIds` là chọn/bỏ chọn tất cả. */
export const cartSelectionSchema = z.object({
  itemIds: z.array(objectId).optional(),
  isSelected: z.boolean(),
});

export type AddCartItemBody = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemBody = z.infer<typeof updateCartItemSchema>;
export type CartSelectionBody = z.infer<typeof cartSelectionSchema>;
