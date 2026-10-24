import type { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import {
  OrderModel,
  UploadedFileModel,
  WarrantyCardModel,
  WarrantyRequestModel,
  type WarrantyRequestDoc,
} from './after-sales.model.js';
import { normalizeSearch } from '../products/search.service.js';
import type { z } from 'zod';
import type { warrantySchema } from './after-sales.schema.js';

export async function validateEvidence(userId: Types.ObjectId, urls: string[], purpose: string) {
  const files = await UploadedFileModel.find({ userId, purpose, url: { $in: urls } }).lean();
  if (new Set(urls).size !== urls.length || files.length !== urls.length)
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Minh chứng không hợp lệ hoặc không thuộc tài khoản này',
    );
  return files;
}
export function timeline(request: {
  status: string;
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  rejectReason?: string;
  timeline?: { status: string; at: Date; note?: string }[];
}, initialStatus = 'PENDING_CONFIRMATION') {
  if (request.timeline?.length && request.timeline.at(-1)?.status === request.status)
    return request.timeline;
  const first = request.timeline?.[0]?.status ?? initialStatus;
  return [
    { status: first, at: request.requestedAt },
    ...(request.status !== first
      ? [
          {
            status: request.status,
            at: request.completedAt ?? request.approvedAt ?? request.requestedAt,
            note: request.rejectReason,
          },
        ]
      : []),
  ];
}
export async function warrantyCards(userId: Types.ObjectId, query?: string, status?: string) {
  const orders = await OrderModel.find({ userId }).lean();
  const byId = new Map(orders.map((o) => [o._id.toString(), o]));
  const cards = await WarrantyCardModel.find({ orderId: { $in: orders.map((o) => o._id) } })
    .sort({ expiresAt: -1 })
    .lean();
  return cards
    .map((card) => {
      const order = byId.get(card.orderId.toString())!;
      const productName =
        order.items.find((i) => i._id.equals(card.orderItemId))?.snapshot.name ??
        'Sản phẩm đổi mới';
      const remainingDays = Math.max(
        0,
        Math.ceil((card.expiresAt.getTime() - Date.now()) / 86400000),
      );
      return {
        id: card._id.toString(),
        orderId: card.orderId.toString(),
        orderCode: order.orderCode,
        productName,
        serialNumber: card.serialNumber ?? '',
        quantity: card.quantity,
        warrantyMonths: card.warrantyMonths,
        activatedAt: card.activatedAt,
        expiresAt: card.expiresAt,
        status: card.status === 'VALID' && !remainingDays ? 'EXPIRED' : card.status,
        remainingDays,
        recipientPhone: order.shippingAddress?.recipientPhone ?? '',
      };
    })
    .filter(
      (card) =>
        (!status || card.status === status) &&
        (!query ||
          normalizeSearch(`${card.serialNumber} ${card.orderCode} ${card.recipientPhone}`).includes(
            normalizeSearch(query),
          )),
    )
    .map(({ recipientPhone: _phone, ...card }) => card);
}
export async function createWarranty(userId: Types.ObjectId, body: z.infer<typeof warrantySchema>) {
  const card = await WarrantyCardModel.findById(body.warrantyCardId).lean();
  if (!card || !(await OrderModel.exists({ _id: card.orderId, userId })))
    throw new AppError('NOT_FOUND', 404, 'Không tìm thấy phiếu bảo hành');
  if (card.status !== 'VALID' || card.expiresAt.getTime() < Date.now())
    throw new AppError('WARRANTY_EXPIRED', 409, 'Phiếu đã hết hạn hoặc không còn hiệu lực');
  await validateEvidence(userId, body.evidence, 'WARRANTY_EVIDENCE');
  return WarrantyRequestModel.create({
    ...body,
    userId,
    status: 'PENDING_CONFIRMATION',
    requestedAt: new Date(),
    timeline: [{ status: 'PENDING_CONFIRMATION', at: new Date() }],
  });
}
export async function warrantyRequestDto(request: WarrantyRequestDoc) {
  const card = await WarrantyCardModel.findById(request.warrantyCardId).lean();
  const order = card ? await OrderModel.findById(card.orderId).lean() : null;
  return {
    id: request._id.toString(),
    warrantyCardId: request.warrantyCardId.toString(),
    productName:
      order?.items.find((i) => i._id.equals(card?.orderItemId))?.snapshot.name ?? 'Sản phẩm',
    defectDescription: request.defectDescription,
    evidence: request.evidence,
    contact: request.contact ?? { name: order?.shippingAddress?.recipientName ?? '', phone: order?.shippingAddress?.recipientPhone ?? '', address: order?.shippingAddress?.addressLine ?? '' },
    status: request.status,
    requestedAt: request.requestedAt,
    rejectReason: request.rejectReason,
    inspectionResult: request.inspectionResult,
    resolution: request.resolution,
    timeline: timeline(request),
  };
}
