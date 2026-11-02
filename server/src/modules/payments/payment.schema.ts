import { z } from 'zod';
import { ReconciliationStatus } from '../../lib/shared-enums.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');

export const paymentListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  reconciliationStatus: z.enum([...Object.values(ReconciliationStatus), 'ALL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const transactionIdParamsSchema = z.object({ transactionId: objectId });

export const resolvePaymentSchema = z.object({
  orderId: objectId.optional(),
  action: z.enum(['MARK_PAID', 'REFUND_BACK', 'IGNORE']),
  note: z.string().trim().min(1, 'Vui lòng ghi chú xử lý đối soát').max(500),
});

export type PaymentListQueryInput = z.infer<typeof paymentListQuerySchema>;
export type ResolvePaymentInput = z.infer<typeof resolvePaymentSchema>;
