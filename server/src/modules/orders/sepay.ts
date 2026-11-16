import { z } from 'zod';
import type { BankTransferEvent } from './bank-transfer.service.js';

/**
 * Payload webhook SePay (đã bỏ các trường không dùng). `transactionDate` là giờ Việt Nam
 * dạng `YYYY-MM-DD HH:mm:ss`, không kèm múi giờ.
 */
export const sepayWebhookSchema = z.object({
  id: z.coerce.number().int().positive(),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.coerce.number().int().nonnegative(),
  content: z.string().nullish(),
  description: z.string().nullish(),
  transactionDate: z.string().min(1),
  accountNumber: z.string().nullish(),
});

export type SepayWebhookBody = z.infer<typeof sepayWebhookSchema>;

/** Đổi `2026-11-15 13:07:51` (giờ VN) sang Date. Trả null nếu không đọc được. */
export function parseSepayDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Đổi webhook SePay sang sự kiện chuyển khoản nội bộ. Chỉ nhận tiền vào (`transferType === 'in'`);
 * tiền ra trả null để route bỏ qua.
 */
export function sepayToBankTransfer(body: SepayWebhookBody): BankTransferEvent | null {
  if (body.transferType !== 'in') return null;
  const transactionAt = parseSepayDate(body.transactionDate);
  if (!transactionAt) return null;
  return {
    // SePay đánh số giao dịch; dùng làm mã để webhook trùng lặp được bỏ qua (idempotent).
    transactionCode: `SEPAY-${body.id}`,
    amount: body.transferAmount,
    content: body.content ?? body.description ?? '',
    transactionAt,
  };
}
