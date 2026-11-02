import type { QueryFilter } from 'mongoose';
import mongoose from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import {
  InspectionResult,
  ReconciliationStatus,
  RefundStatus,
  ReturnCostBearer,
  ReturnStatus,
  ReturnType,
  TransactionType,
} from '../../lib/shared-enums.js';
import type { ReturnRequest } from '../../lib/shared-types.js';
import { UserModel } from '../auth/auth.model.js';
import { OrderModel, type OrderDocument } from '../orders/order.model.js';
import { PaymentTransactionModel } from '../payments/payment.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { WarrantyCardModel } from '../warranty/warranty.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { ReturnRequestModel, type ReturnRequestDoc, type ReturnRequestDocument } from './return.model.js';
import type {
  ReceiveReturnInput,
  RefundReturnInput,
  RejectReturnInput,
  ReturnListQuery,
  UpdateReturnInput,
} from './return.schema.js';

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

async function toDto(doc: ReturnRequestDocument): Promise<ReturnRequest> {
  const [order, user] = await Promise.all([
    OrderModel.findById(doc.orderId),
    UserModel.findById(doc.userId).select('profile phoneNumber'),
  ]);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng đổi trả');
  const orderItem = order.items.find((item) => String(item._id) === String(doc.orderItemId));
  if (!orderItem) throw new AppError('ORDER_ITEM_NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong đơn');

  const quantity = doc.quantity;
  const returnedAmount = Math.round(orderItem.finalAmount * quantity / orderItem.quantity);
  const dto: ReturnRequest = {
    id: String(doc._id),
    code: doc.code,
    orderId: String(doc.orderId),
    orderCode: order.orderCode,
    customerName: user?.profile?.fullName ?? order.shippingAddress.recipientName,
    customerPhone: user?.phoneNumber ?? order.shippingAddress.recipientPhone,
    type: doc.type === 'RETURN' ? ReturnType.REFUND : ReturnType.EXCHANGE,
    status: doc.status as ReturnStatus,
    items: [{
      orderItemId: String(orderItem._id),
      name: orderItem.snapshot.name,
      sku: orderItem.snapshot.sku,
      quantity,
      finalAmount: returnedAmount,
      reason: doc.reason,
      evidence: doc.evidence,
    }],
    requestedAt: doc.requestedAt.toISOString(),
    costBearer: doc.costBearer === 'CARAVESO' ? ReturnCostBearer.SHOP : ReturnCostBearer.CUSTOMER,
    returnFee: doc.returnShippingFee,
    pickupSchedule: doc.pickupSchedule?.toISOString() ?? null,
    trackingCode: doc.customerShipment.trackingCode ?? null,
    inspectionResult: doc.inspectionResult ?? null,
    replacement: doc.replacement.productName || doc.replacement.sku
      ? {
          productName: doc.replacement.productName ?? '',
          sku: doc.replacement.sku ?? '',
          quantity: doc.replacement.quantity ?? 1,
          differenceAmount: Math.max(0, (doc.replacement.unitPrice ?? 0) * (doc.replacement.quantity ?? 0) - returnedAmount),
          trackingCode: doc.returnShipment.trackingCode ?? doc.replacement.trackingCode ?? null,
          deliveredAt: doc.replacement.deliveredAt?.toISOString() ?? null,
        }
      : null,
    refund: doc.refund.completed
      ? {
          amount: doc.refundAmount ?? 0,
          proofImage: doc.refund.proofImage ?? null,
          transactionAt: doc.refund.transactionAt?.toISOString() ?? null,
          completed: true,
        }
      : null,
    rejectReason: doc.rejectReason ?? null,
    note: doc.description ?? null,
  };
  return dto;
}

async function requireReturn(id: string): Promise<ReturnRequestDocument> {
  const doc = await ReturnRequestModel.findById(id);
  if (!doc) throw new AppError('RETURN_REQUEST_NOT_FOUND', 404, 'Không tìm thấy yêu cầu đổi trả');
  return doc;
}

async function audit(action: string, doc: ReturnRequestDoc, actor: ActorContext): Promise<void> {
  await writeAuditLog({
    userId: actor.userId,
    action,
    targetType: 'return_request',
    targetId: String(doc._id),
    ipAddress: actor.ip,
  });
}

export async function listReturns(query: ReturnListQuery): Promise<PageResult<ReturnRequest>> {
  const filter: QueryFilter<ReturnRequestDoc> = {};
  if (query.status && query.status !== 'ALL') filter.status = query.status;
  if (query.type && query.type !== 'ALL') {
    filter.type = query.type === ReturnType.REFUND ? 'RETURN' : 'EXCHANGE';
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    const [orders, users] = await Promise.all([
      OrderModel.find({ orderCode: regex }).select('_id').limit(200).lean(),
      UserModel.find({ 'profile.fullName': regex }).select('_id').limit(200).lean(),
    ]);
    filter.$or = [
      { code: regex },
      { reason: regex },
      ...(orders.length ? [{ orderId: { $in: orders.map((order) => order._id) } }] : []),
      ...(users.length ? [{ userId: { $in: users.map((user) => user._id) } }] : []),
    ];
  }
  const page = query.page;
  const limit = query.limit;
  const [docs, total] = await Promise.all([
    ReturnRequestModel.find(filter).sort({ requestedAt: -1 }).skip((page - 1) * limit).limit(limit),
    ReturnRequestModel.countDocuments(filter),
  ]);
  return {
    data: await Promise.all(docs.map(toDto)),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getReturn(id: string): Promise<ReturnRequest> {
  return toDto(await requireReturn(id));
}

export async function confirmReturn(id: string, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.status !== ReturnStatus.PENDING) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ xác nhận yêu cầu đang chờ xử lý');
  }
  doc.status = ReturnStatus.CONFIRMED;
  doc.approvedAt = new Date();
  await doc.save();
  await audit('RETURN_CONFIRMED', doc, actor);
  return toDto(doc);
}

export async function rejectReturn(id: string, input: RejectReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (![ReturnStatus.PENDING, ReturnStatus.CONFIRMED].includes(doc.status as ReturnStatus)) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Không thể từ chối yêu cầu ở trạng thái hiện tại');
  }
  doc.status = ReturnStatus.REJECTED;
  doc.rejectReason = input.rejectReason;
  await doc.save();
  await audit('RETURN_REJECTED', doc, actor);
  return toDto(doc);
}

export async function updateReturn(id: string, input: UpdateReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (input.replacement) {
    if (doc.type !== 'EXCHANGE' || doc.status !== ReturnStatus.PROCESSING) {
      throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ cập nhật sản phẩm thay thế khi yêu cầu đổi hàng đang xử lý');
    }
    const replacement = input.replacement;
    const variant = await VariantModel.findOne({
      sku: replacement.sku,
      status: 'ACTIVE',
      stockQuantity: { $gte: replacement.quantity },
    }).select('productId sku salePrice stockQuantity');
    if (!variant) {
      throw new AppError('REPLACEMENT_VARIANT_UNAVAILABLE', 409, 'SKU không tồn tại, đã ngừng bán hoặc không đủ tồn kho');
    }
    const product = await ProductModel.findOne({ _id: variant.productId, status: 'ACTIVE' }).select('name');
    if (!product) {
      throw new AppError('REPLACEMENT_PRODUCT_UNAVAILABLE', 409, 'Sản phẩm thay thế hiện không được kinh doanh');
    }
    doc.replacement.variantId = variant._id;
    doc.replacement.quantity = replacement.quantity;
    doc.replacement.unitPrice = variant.salePrice;
    doc.replacement.productName = product.name;
    doc.replacement.sku = variant.sku;
    doc.replacement.deliveredAt = null;
    doc.replacement.trackingCode = replacement.trackingCode;
    doc.returnShipment.trackingCode = replacement.trackingCode;
  } else if (![ReturnStatus.CONFIRMED, ReturnStatus.AWAITING_GOODS].includes(doc.status as ReturnStatus)) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ cập nhật lịch lấy hàng hoặc vận đơn khi đã xác nhận');
  }
  if (input.costBearer) doc.costBearer = input.costBearer === 'SHOP' ? 'CARAVESO' : 'CUSTOMER';
  if (input.returnFee !== undefined) doc.returnShippingFee = input.returnFee;
  if (input.pickupSchedule !== undefined) doc.pickupSchedule = input.pickupSchedule ? new Date(input.pickupSchedule) : null;
  if (input.trackingCode !== undefined) doc.customerShipment.trackingCode = input.trackingCode;
  if (!input.replacement) doc.status = ReturnStatus.AWAITING_GOODS;
  await doc.save();
  await audit('RETURN_UPDATED', doc, actor);
  return toDto(doc);
}

export async function receiveReturn(id: string, input: ReceiveReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (![ReturnStatus.CONFIRMED, ReturnStatus.AWAITING_GOODS].includes(doc.status as ReturnStatus)) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Yêu cầu phải được xác nhận trước khi kiểm tra');
  }
  doc.inspectionResult = input.inspectionResult;
  doc.description = input.note ?? doc.description;
  doc.status = ReturnStatus.PROCESSING;
  await doc.save();
  await audit('RETURN_RECEIVED', doc, actor);
  return toDto(doc);
}

export async function refundReturn(id: string, input: RefundReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'RETURN' || doc.status !== ReturnStatus.PROCESSING) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ hoàn tiền cho yêu cầu trả hàng đang xử lý');
  }
  if (doc.refund.completed) {
    throw new AppError('REFUND_ALREADY_COMPLETED', 409, 'Yêu cầu này đã được hoàn tiền');
  }
  const order = await OrderModel.findById(doc.orderId);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const item = order.items.find((entry) => String(entry._id) === String(doc.orderItemId));
  if (!item) throw new AppError('ORDER_ITEM_NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong đơn');

  const gross = Math.round(item.finalAmount * doc.quantity / item.quantity);
  const maximumRefund = Math.max(0, gross - (doc.costBearer === 'CUSTOMER' ? doc.returnShippingFee + doc.disassemblyFee : 0));
  const amount = input.amount ?? maximumRefund;
  if (amount > maximumRefund) {
    throw new AppError('REFUND_AMOUNT_EXCEEDED', 400, 'Số tiền hoàn vượt quá số tiền khách đã thanh toán');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await ReturnRequestModel.findOne({
        _id: doc._id,
        status: ReturnStatus.PROCESSING,
        'refund.completed': false,
      }).session(session);
      if (!current) {
        throw new AppError('REFUND_ALREADY_COMPLETED', 409, 'Yêu cầu này đã được hoàn tiền hoặc thay đổi trạng thái');
      }
      current.refundAmount = amount;
      current.refund.proofImage = input.proofImage;
      current.refund.transactionAt = new Date(input.transactionAt);
      current.refund.completed = true;
      current.status = ReturnStatus.COMPLETED;
      current.completedAt = new Date();
      await current.save({ session });

      const handler = await UserModel.findById(actor.userId).select('profile').session(session);
      await PaymentTransactionModel.create(
        [{
          orderId: order._id,
          returnRequestId: current._id,
          type: TransactionType.REFUND,
          amount,
          recordSource: 'MANUAL',
          reconciliationStatus: ReconciliationStatus.MANUALLY_RESOLVED,
          status: RefundStatus.COMPLETED,
          note: `Hoàn tiền yêu cầu ${current.code}`,
          handledById: actor.userId,
          handledByName: handler?.profile?.fullName ?? null,
          transactionAt: new Date(input.transactionAt),
        }],
        { session },
      );
      Object.assign(doc, current.toObject());
    });
  } finally {
    await session.endSession();
  }
  await audit('RETURN_REFUNDED', doc, actor);
  return toDto(doc);
}

export async function completeReturn(id: string, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'EXCHANGE' || doc.status !== ReturnStatus.PROCESSING) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ hoàn tất yêu cầu đổi hàng đang xử lý');
  }
  if (!doc.replacement.variantId || !doc.replacement.quantity || !doc.returnShipment.trackingCode) {
    throw new AppError('REPLACEMENT_DETAILS_REQUIRED', 400, 'Cần có sản phẩm thay thế và mã vận đơn trước khi hoàn tất');
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await ReturnRequestModel.findOne({
        _id: doc._id,
        type: 'EXCHANGE',
        status: ReturnStatus.PROCESSING,
      }).session(session);
      if (!current) {
        throw new AppError('RETURN_INVALID_STATE', 409, 'Yêu cầu đổi hàng đã hoàn tất hoặc thay đổi trạng thái');
      }
      const replacementQuantity = current.replacement.quantity;
      if (!current.replacement.variantId || !replacementQuantity) {
        throw new AppError('REPLACEMENT_DETAILS_REQUIRED', 400, 'Thiếu SKU hoặc số lượng sản phẩm thay thế');
      }
      const variant = await VariantModel.findOneAndUpdate(
        {
          _id: current.replacement.variantId,
          status: 'ACTIVE',
          stockQuantity: { $gte: replacementQuantity },
        },
        { $inc: { stockQuantity: -replacementQuantity } },
        { new: true, session },
      );
      if (!variant) {
        throw new AppError('REPLACEMENT_STOCK_UNAVAILABLE', 409, 'Không đủ tồn kho để giao sản phẩm thay thế');
      }
      const replacementProduct = await ProductModel.findOne({ _id: variant.productId, status: 'ACTIVE' })
        .select('name warrantyMonths')
        .session(session);
      if (!replacementProduct) {
        throw new AppError('REPLACEMENT_PRODUCT_UNAVAILABLE', 409, 'Sản phẩm thay thế hiện không được kinh doanh');
      }
      const completedAt = new Date();
      current.replacement.deliveredAt = completedAt;
      const warrantyMonths = replacementProduct.warrantyMonths;
      await WarrantyCardModel.updateOne(
        { orderId: current.orderId, orderItemId: current.orderItemId },
        {
          $set: {
            startsAt: completedAt,
            expiresAt: new Date(new Date(completedAt).setMonth(completedAt.getMonth() + warrantyMonths)),
            warrantyMonths,
            productName: replacementProduct.name,
            sku: variant.sku,
          },
          $setOnInsert: {
            orderId: current.orderId,
            orderItemId: current.orderItemId,
            userId: current.userId,
          },
        },
        { session, upsert: true },
      );
      current.status = ReturnStatus.COMPLETED;
      current.completedAt = completedAt;
      await current.save({ session });
      Object.assign(doc, current.toObject());
    });
  } finally {
    await session.endSession();
  }
  await audit('RETURN_COMPLETED', doc, actor);
  return toDto(doc);
}
