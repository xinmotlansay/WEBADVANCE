import { z } from 'zod';
import type { BankTransferEvent } from './bank-transfer.service.js';

/** Payload webhook SePay (developer.sepay.vn → Tích hợp Webhook); chỉ khai báo trường cần dùng. */
export const sepayWebhookSchema = z.object({
  id: z.number().int(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  content: z.string().max(500),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.number().int().positive(),
});

export type SepayWebhookBody = z.infer<typeof sepayWebhookSchema>;

/**
 * Đổi payload SePay về sự kiện chung của webhook ngân hàng. Tiền ra trả `null`.
 * `id` giữ nguyên khi SePay gửi lại nên dùng làm mã giao dịch; `transactionDate` là giờ Việt Nam
 * không kèm múi giờ.
 */
export function fromSepay(body: SepayWebhookBody): BankTransferEvent | null {
  if (body.transferType !== 'in') return null;
  return {
    transactionCode: `SEPAY-${body.id}`,
    amount: body.transferAmount,
    content: body.content,
    transactionAt: new Date(`${body.transactionDate.replace(' ', 'T')}+07:00`),
  };
}
