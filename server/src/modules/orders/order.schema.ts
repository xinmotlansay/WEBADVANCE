import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max);

export const cancelOrderSchema = z.object({
  reason: text(100),
  reasonNote: z.string().trim().max(500).optional(),
  refundAccount: z
    .object({ bankName: text(100), accountNumber: text(30), accountHolder: text(100) })
    .optional(),
});

export const rescheduleSchema = z.object({
  scheduledDate: z.iso.date('Ngày hẹn không hợp lệ'),
  scheduledSlot: z.enum(['MORNING', 'AFTERNOON']),
});

export const bankTransferSchema = z.object({
  transactionCode: text(100),
  amount: z.number().int().positive(),
  content: z.string().max(500),
  transactionAt: z.coerce.date(),
});

export type CancelOrderBody = z.infer<typeof cancelOrderSchema>;
export type RescheduleBody = z.infer<typeof rescheduleSchema>;
export type BankTransferBody = z.infer<typeof bankTransferSchema>;
