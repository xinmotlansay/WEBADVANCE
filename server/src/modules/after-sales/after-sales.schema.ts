import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(?:0|\+?84)\d{9,10}$/, 'Số điện thoại không hợp lệ'),
  address: z.string().trim().min(10).max(500),
});
export const evidenceSchema = z
  .array(z.string().startsWith('/uploads/').max(200))
  .min(1, 'Cần ít nhất một minh chứng')
  .max(6);
export const warrantySchema = z.object({
  warrantyCardId: objectId,
  defectDescription: z.string().trim().min(10).max(3000),
  evidence: evidenceSchema,
  contact: contactSchema,
});
export const afterSalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.string().max(40).optional(),
});
export const returnSchema = z
  .object({
    orderId: objectId,
    orderItemId: objectId,
    type: z.enum(['RETURN', 'EXCHANGE']),
    quantity: z.number().int().min(1).max(10000),
    reason: z.enum(['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'CHANGED_MIND', 'OTHER']),
    description: z.string().trim().min(10).max(3000),
    evidence: evidenceSchema,
    contact: contactSchema,
    replacementVariantId: objectId.nullish(),
    refundAccount: z
      .object({
        bankName: z.string().trim().min(2).max(100),
        accountNumber: z
          .string()
          .trim()
          .regex(/^\d{6,30}$/),
        accountHolder: z.string().trim().min(2).max(100),
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.type === 'RETURN' && !body.refundAccount)
      ctx.addIssue({ code: 'custom', path: ['refundAccount'], message: 'Cần tài khoản hoàn tiền' });
    if (body.type === 'EXCHANGE' && !body.replacementVariantId)
      ctx.addIssue({
        code: 'custom',
        path: ['replacementVariantId'],
        message: 'Cần chọn biến thể thay thế',
      });
  });
