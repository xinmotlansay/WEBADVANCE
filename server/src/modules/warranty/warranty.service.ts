import type { QueryFilter } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import { WarrantyStatus } from '../../lib/shared-enums.js';
import type { WarrantyRequest } from '../../lib/shared-types.js';
import { UserModel } from '../auth/auth.model.js';
import { OrderModel, type OrderDocument } from '../orders/order.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';
import {
  WarrantyCardModel,
  WarrantyRequestModel,
  type WarrantyRequestDoc,
  type WarrantyRequestDocument,
} from './warranty.model.js';
import { assertWarrantyUpdateAllowed } from './warranty.rules.js';
import type {
  RejectWarrantyInput,
  UpdateWarrantyStatusInput,
  WarrantyListQuery,
} from './warranty.schema.js';

export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface ActorContext {
  userId: string;
  ip?: string | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function toDto(doc: WarrantyRequestDocument): Promise<WarrantyRequest> {
  const [order, user, card] = await Promise.all([
    OrderModel.findById(doc.orderId),
    UserModel.findById(doc.userId).select('profile phoneNumber'),
    WarrantyCardModel.findById(doc.warrantyCardId),
  ]);
  const item = order?.items.find((entry) => String(entry._id) === String(doc.orderItemId));
  if (!card) throw new AppError('WARRANTY_CARD_NOT_FOUND', 404, 'Không tìm thấy phiếu bảo hành');
  const dataIntegrityWarning =
    !order || !item
      ? 'Không tìm thấy đơn hàng hoặc sản phẩm gốc. Hãy kiểm tra dữ liệu trước khi xử lý phiếu.'
      : null;
  if (dataIntegrityWarning) {
    logger.warn(
      {
        warrantyRequestId: String(doc._id),
        orderFound: Boolean(order),
        orderItemFound: Boolean(item),
      },
      'Phiếu bảo hành thiếu liên kết đơn hàng',
    );
  }

  return {
    id: String(doc._id),
    code: doc.code ?? '—',
    orderId: doc.orderId ? String(doc.orderId) : '—',
    orderCode: order?.orderCode ?? 'Đơn gốc không tồn tại',
    customerName:
      user?.profile?.fullName ?? order?.shippingAddress.recipientName ?? 'Không xác định',
    customerPhone: user?.phoneNumber ?? order?.shippingAddress.recipientPhone ?? '—',
    productName: card.productName ?? item?.snapshot.name ?? 'Sản phẩm không xác định',
    sku: card.sku ?? item?.snapshot.sku ?? '—',
    purchasedAt:
      card.startsAt?.toISOString() ??
      order?.createdAt?.toISOString() ??
      doc.requestedAt.toISOString(),
    warrantyMonths: card.warrantyMonths,
    expiresAt: card.expiresAt?.toISOString() ?? doc.requestedAt.toISOString(),
    status: doc.status,
    condition: doc.condition,
    reason: doc.defectDescription,
    evidence: doc.evidence,
    requestedAt: doc.requestedAt.toISOString(),
    homeServiceSchedule: doc.homeServiceSchedule?.toISOString() ?? null,
    trackingCode: doc.returnShipment.trackingCode ?? doc.customerShipment.trackingCode ?? null,
    inspectionResult: doc.inspectionResult ?? null,
    resolution: doc.resolution ?? null,
    rejectReason: doc.rejectReason ?? null,
    dataIntegrityWarning,
    history: doc.history.map((entry) => ({
      at: entry.at.toISOString(),
      status: entry.status,
      note: entry.note ?? null,
    })),
  };
}

async function requireWarranty(id: string): Promise<WarrantyRequestDocument> {
  const doc = await WarrantyRequestModel.findById(id);
  if (!doc)
    throw new AppError('WARRANTY_REQUEST_NOT_FOUND', 404, 'Không tìm thấy yêu cầu bảo hành');
  return doc;
}

async function audit(action: string, doc: WarrantyRequestDoc, actor: ActorContext): Promise<void> {
  await writeAuditLog({
    userId: actor.userId,
    action,
    targetType: 'warranty_request',
    targetId: String(doc._id),
    ipAddress: actor.ip,
  });
}

function appendHistory(doc: WarrantyRequestDocument, status: WarrantyStatus, note?: string): void {
  doc.status = status;
  doc.history.push({ at: new Date(), status, note: note ?? null });
  if (status === WarrantyStatus.RECEIVED) doc.approvedAt = new Date();
  if (status === WarrantyStatus.COMPLETED) doc.completedAt = new Date();
}

export async function listWarranties(
  query: WarrantyListQuery,
): Promise<PageResult<WarrantyRequest>> {
  const filter: QueryFilter<WarrantyRequestDoc> = {};
  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    const [orders, users] = await Promise.all([
      OrderModel.find({ orderCode: regex }).select('_id').limit(200).lean(),
      UserModel.find({ 'profile.fullName': regex }).select('_id').limit(200).lean(),
    ]);
    filter.$or = [
      { code: regex },
      { defectDescription: regex },
      ...(orders.length ? [{ orderId: { $in: orders.map((order) => order._id) } }] : []),
      ...(users.length ? [{ userId: { $in: users.map((user) => user._id) } }] : []),
    ];
  }
  const page = query.page;
  const limit = query.limit;
  const [docs, total] = await Promise.all([
    WarrantyRequestModel.find(filter)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    WarrantyRequestModel.countDocuments(filter),
  ]);
  return {
    data: await Promise.all(docs.map(toDto)),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getWarranty(id: string): Promise<WarrantyRequest> {
  return toDto(await requireWarranty(id));
}

export async function acceptWarranty(id: string, actor: ActorContext): Promise<WarrantyRequest> {
  const doc = await requireWarranty(id);
  if (doc.status !== WarrantyStatus.PENDING_CONFIRMATION) {
    throw new AppError('WARRANTY_INVALID_STATE', 409, 'Chỉ tiếp nhận yêu cầu đang chờ xác nhận');
  }
  appendHistory(doc, WarrantyStatus.RECEIVED, 'Đã tiếp nhận yêu cầu bảo hành');
  await doc.save();
  await audit('WARRANTY_ACCEPTED', doc, actor);
  return toDto(doc);
}

export async function rejectWarranty(
  id: string,
  input: RejectWarrantyInput,
  actor: ActorContext,
): Promise<WarrantyRequest> {
  const doc = await requireWarranty(id);
  if (![WarrantyStatus.PENDING_CONFIRMATION, WarrantyStatus.RECEIVED].includes(doc.status)) {
    throw new AppError(
      'WARRANTY_INVALID_STATE',
      409,
      'Không thể từ chối yêu cầu ở trạng thái hiện tại',
    );
  }
  doc.rejectReason = input.rejectReason;
  appendHistory(doc, WarrantyStatus.REJECTED, input.rejectReason);
  await doc.save();
  await audit('WARRANTY_REJECTED', doc, actor);
  return toDto(doc);
}

export async function updateWarrantyStatus(
  id: string,
  input: UpdateWarrantyStatusInput,
  actor: ActorContext,
): Promise<WarrantyRequest> {
  const doc = await requireWarranty(id);
  const currentStatus = doc.status;
  assertWarrantyUpdateAllowed(currentStatus, input.status);
  if (input.status === WarrantyStatus.COMPLETED && !input.resolution) {
    throw new AppError(
      'WARRANTY_RESOLUTION_REQUIRED',
      400,
      'Chọn kết quả xử lý trước khi hoàn tất',
    );
  }
  if (input.inspectionResult) doc.inspectionResult = input.inspectionResult;
  if (input.resolution) doc.resolution = input.resolution;
  if (input.homeServiceSchedule !== undefined) {
    doc.homeServiceSchedule = input.homeServiceSchedule
      ? new Date(input.homeServiceSchedule)
      : null;
  }
  if (input.trackingCode !== undefined) doc.returnShipment.trackingCode = input.trackingCode;
  if (input.status !== currentStatus) {
    appendHistory(doc, input.status, input.note);
  } else if (input.note) {
    doc.history.push({ at: new Date(), status: currentStatus, note: input.note });
  }
  await doc.save();
  await audit('WARRANTY_STATUS_UPDATED', doc, actor);
  return toDto(doc);
}
