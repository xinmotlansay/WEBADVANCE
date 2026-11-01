import { z } from 'zod';
import { LateCompensationStatus, OrderPaymentStatus, OrderStatus } from '../../lib/shared-enums.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');

export const orderIdParamsSchema = z.object({ id: objectId });

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum([...Object.values(OrderStatus), 'ALL']).optional(),
  paymentStatus: z.enum([...Object.values(OrderPaymentStatus), 'ALL']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, 'Vui lòng chọn lý do hủy').max(200),
  note: z.string().trim().max(500).optional(),
  refundToCustomer: z.boolean().optional(),
});

export const updateShipmentSchema = z.object({
  carrier: z.string().trim().max(120).nullable().optional(),
  trackingCode: z.string().trim().max(120).nullable().optional(),
  assignedTeam: z.string().trim().max(120).nullable().optional(),
  installationSchedule: z.string().datetime().nullable().optional(),
  handover: z.boolean().optional(),
});

export const deliveryFailedSchema = z.object({
  failureReason: z.string().trim().min(1, 'Vui lòng nhập lý do giao thất bại').max(500),
  note: z.string().trim().max(500).optional(),
});

export const finalizeReturnSchema = z.object({
  actualShippingCost: z.number().min(0, 'Phí vận chuyển không hợp lệ'),
  note: z.string().trim().max(500).optional(),
});

export const lateCompensationQuerySchema = z.object({
  status: z.nativeEnum(LateCompensationStatus).optional(),
});

export const rejectCompensationSchema = z.object({
  reason: z.string().trim().min(1, 'Vui lòng nhập lý do từ chối').max(500),
});

export const compensationIdParamsSchema = z.object({ id: objectId });

export type OrderListQueryInput = z.infer<typeof orderListQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
export type DeliveryFailedInput = z.infer<typeof deliveryFailedSchema>;
export type FinalizeReturnInput = z.infer<typeof finalizeReturnSchema>;
