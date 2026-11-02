import { z } from 'zod';
import { WarrantyStatus, WarrantyInspectionResult, WarrantyResolution } from '../../lib/shared-enums.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');

export const warrantyListQuerySchema = z.object({
  status: z.enum([...Object.values(WarrantyStatus), 'ALL']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const warrantyIdParamsSchema = z.object({ id: objectId });
export const rejectWarrantySchema = z.object({ rejectReason: z.string().trim().min(1).max(500) });
export const updateWarrantyStatusSchema = z.object({
  status: z.nativeEnum(WarrantyStatus),
  inspectionResult: z.nativeEnum(WarrantyInspectionResult).optional(),
  resolution: z.nativeEnum(WarrantyResolution).optional(),
  homeServiceSchedule: z.string().datetime().nullable().optional(),
  trackingCode: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export type WarrantyListQuery = z.infer<typeof warrantyListQuerySchema>;
export type RejectWarrantyInput = z.infer<typeof rejectWarrantySchema>;
export type UpdateWarrantyStatusInput = z.infer<typeof updateWarrantyStatusSchema>;
