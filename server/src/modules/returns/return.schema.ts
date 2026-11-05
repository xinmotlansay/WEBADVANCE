import { z } from 'zod';
import { InspectionResult, ReturnCostBearer, ReturnStatus, ReturnType } from '../../lib/shared-enums.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');

export const returnListQuerySchema = z.object({
  status: z.enum([...Object.values(ReturnStatus), 'ALL']).optional(),
  type: z.enum([...Object.values(ReturnType), 'ALL']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const returnIdParamsSchema = z.object({ id: objectId });
export const rejectReturnSchema = z.object({ rejectReason: z.string().trim().min(1).max(500) });
export const updateReturnSchema = z.object({
  costBearer: z.nativeEnum(ReturnCostBearer).optional(),
  returnFee: z.number().min(0).optional(),
  pickupSchedule: z.string().datetime().nullable().optional(),
  trackingCode: z.string().trim().max(120).nullable().optional(),
  // Sản phẩm thay thế là sản phẩm khách đã chọn khi gửi yêu cầu. Mã vận đơn bỏ trống thì hệ thống tự
  // tạo; `sku` và `quantity` chỉ dùng khi phải đổi sang sản phẩm khác (hoặc yêu cầu cũ chưa có sản phẩm thay thế).
  replacement: z.object({
    trackingCode: z.string().trim().max(120).optional(),
    sku: z.string().trim().min(1).max(80).optional(),
    quantity: z.number().int().min(1).max(100).optional(),
  }).optional(),
});
export const receiveReturnSchema = z.object({
  inspectionResult: z.nativeEnum(InspectionResult),
  note: z.string().trim().max(500).optional(),
});
export const approveRefundSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});
export const refundReturnSchema = z.object({
  proofImage: z.string().trim().min(1).max(500),
  transactionAt: z.string().datetime(),
  amount: z.number().min(0).optional(),
});

export type ReturnListQuery = z.infer<typeof returnListQuerySchema>;
export type RejectReturnInput = z.infer<typeof rejectReturnSchema>;
export type UpdateReturnInput = z.infer<typeof updateReturnSchema>;
export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;
export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;
export type RefundReturnInput = z.infer<typeof refundReturnSchema>;
