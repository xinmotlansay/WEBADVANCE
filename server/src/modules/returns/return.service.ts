import type { QueryFilter } from 'mongoose';
import mongoose from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import {
  InspectionResult,
  ReconciliationStatus,
  RefundSource,
  RefundStatus,
  ReturnCostBearer,
  ReturnStatus,
  ReturnType,
  TransactionType,
} from '../../lib/shared-enums.js';
import type { ReturnRequest } from '../../lib/shared-types.js';
import { UserModel } from '../auth/auth.model.js';
import { OrderModel, toSharedOrderStatus, type OrderDocument } from '../orders/order.model.js';
import { createExchangeOrder, exchangeDeliveryFee } from '../orders/order.service.js';
import { PaymentTransactionModel } from '../payments/payment.model.js';
import { refundDestinationFor } from '../payments/payment.rules.js';
import { requestRefund, settleOrderRefundStatus } from '../payments/refund.service.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { WarrantyCardModel } from '../warranty/warranty.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { ReturnRequestModel, type ReturnRequestDoc, type ReturnRequestDocument } from './return.model.js';
import type {
  ApproveRefundInput,
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

/**
 * Sản phẩm thay thế khách đã chọn khi gửi yêu cầu đổi hàng. Yêu cầu cũ chưa lưu tên/SKU thì tra theo
 * biến thể, để Order Admin luôn thấy sản phẩm cần giao mà không phải nhập lại.
 */
async function replacementOf(doc: ReturnRequestDoc, returnedAmount: number): Promise<ReturnRequest['replacement']> {
  const stored = doc.replacement;
  if (!stored.variantId && !stored.productName && !stored.sku) return null;
  let { productName, sku } = stored;
  if ((!productName || !sku) && stored.variantId) {
    const variant = await VariantModel.findById(stored.variantId).select('productId sku');
    const product = variant ? await ProductModel.findById(variant.productId).select('name') : null;
    productName = productName || product?.name || '';
    sku = sku || variant?.sku || '';
  }
  const quantity = stored.quantity ?? doc.quantity;
  const customerPays = effectiveCostBearer(doc) === 'CUSTOMER';
  const deliveryFee =
    customerPays && stored.variantId ? await exchangeDeliveryFee(stored.variantId, quantity) : 0;
  const differenceAmount = Math.max(0, (stored.unitPrice ?? 0) * quantity - returnedAmount);
  return {
    productName: productName ?? '',
    sku: sku ?? '',
    quantity,
    differenceAmount,
    deliveryFee,
    // Số tiền khách trả COD khi nhận hàng đổi: chênh lệch + phí giao + phí lấy hàng (khi khách chịu phí).
    collectAmount: differenceAmount + deliveryFee + (customerPays ? doc.returnShippingFee : 0),
    trackingCode: doc.returnShipment.trackingCode ?? stored.trackingCode ?? null,
    deliveredAt: stored.deliveredAt?.toISOString() ?? null,
  };
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
  const replacement = await replacementOf(doc, returnedAmount);
  const exchangeOrder = doc.exchangeOrderId
    ? await OrderModel.findById(doc.exchangeOrderId).select('orderCode status')
    : null;
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
    costBearer: effectiveCostBearer(doc) === 'CARAVESO' ? ReturnCostBearer.SHOP : ReturnCostBearer.CUSTOMER,
    returnFee: doc.returnShippingFee,
    pickupSchedule: doc.pickupSchedule?.toISOString() ?? null,
    trackingCode: doc.customerShipment.trackingCode ?? null,
    inspectionResult: doc.inspectionResult ?? null,
    replacement: replacement,
    exchangeOrder: exchangeOrder
      ? { id: String(exchangeOrder._id), orderCode: exchangeOrder.orderCode, status: toSharedOrderStatus(exchangeOrder.status) }
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
    refundAccount: doc.refundAccount?.accountNumber
      ? {
          bankName: doc.refundAccount.bankName ?? '',
          accountNumber: doc.refundAccount.accountNumber,
          accountHolder: doc.refundAccount.accountHolder ?? '',
        }
      : null,
    contact: doc.contact?.name ? { name: doc.contact.name ?? '', phone: doc.contact.phone ?? '', address: doc.contact.address ?? '' } : null,
    history: toHistory(doc),
  };
  return dto;
}

/** Ghi một bước vào lịch sử phiếu; yêu cầu do khách gửi chưa có dòng đầu tiên nên được bù khi đọc (`toHistory`). */
function pushHistory(doc: { history: { at: Date; status: string; note?: string | null }[] }, status: string, note?: string | null): void {
  doc.history.push({ at: new Date(), status, note: note ?? null });
}

function toHistory(doc: ReturnRequestDoc) {
  const entries = doc.history ?? [];
  const list = entries.some((entry) => entry.status === 'PENDING')
    ? entries
    : [{ at: doc.requestedAt, status: 'PENDING', note: null }, ...entries];
  return list.map((entry) => ({ at: entry.at.toISOString(), status: entry.status, note: entry.note ?? null }));
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
  pushHistory(doc, ReturnStatus.CONFIRMED, 'Đã xác nhận yêu cầu');
  await doc.save();
  await audit('RETURN_CONFIRMED', doc, actor);
  return toDto(doc);
}

export async function rejectReturn(id: string, input: RejectReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  // Trả hàng đã kiểm tra mà hàng có vấn đề thì vẫn từ chối được (chưa duyệt hoàn tiền).
  const rejectable =
    [ReturnStatus.PENDING, ReturnStatus.CONFIRMED].includes(doc.status as ReturnStatus) ||
    (doc.type === 'RETURN' && doc.status === ReturnStatus.PROCESSING);
  if (!rejectable) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Không thể từ chối yêu cầu ở trạng thái hiện tại');
  }
  doc.status = ReturnStatus.REJECTED;
  doc.rejectReason = input.rejectReason;
  pushHistory(doc, ReturnStatus.REJECTED, input.rejectReason);
  await doc.save();
  await audit('RETURN_REJECTED', doc, actor);
  return toDto(doc);
}

/** Mã vận đơn nội bộ của hàng thay thế, ổn định theo mã phiếu nên gọi lại không đổi mã. */
export function generateReplacementTracking(returnCode: string): string {
  return `GH-${returnCode}`;
}

export async function updateReturn(id: string, input: UpdateReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (input.replacement) {
    if (doc.type !== 'EXCHANGE' || doc.status !== ReturnStatus.PROCESSING) {
      throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ cập nhật sản phẩm thay thế khi yêu cầu đổi hàng đang xử lý');
    }
    const replacement = input.replacement;
    // Mặc định giao đúng sản phẩm và số lượng khách đã chọn; chỉ tra theo SKU khi admin chủ động đổi
    // sang sản phẩm khác, hoặc yêu cầu cũ chưa có sản phẩm thay thế.
    const keepCustomerChoice = !replacement.sku && !!doc.replacement.variantId;
    if (!keepCustomerChoice && !replacement.sku) {
      throw new AppError('REPLACEMENT_DETAILS_REQUIRED', 400, 'Yêu cầu chưa có sản phẩm thay thế, cần nhập SKU');
    }
    const quantity = replacement.quantity ?? doc.replacement.quantity ?? doc.quantity;
    const variant = await VariantModel.findOne({
      ...(keepCustomerChoice ? { _id: doc.replacement.variantId } : { sku: replacement.sku }),
      status: 'ACTIVE',
      stockQuantity: { $gte: quantity },
    }).select('productId sku salePrice stockQuantity');
    if (!variant) {
      throw new AppError(
        'REPLACEMENT_VARIANT_UNAVAILABLE',
        409,
        keepCustomerChoice
          ? 'Sản phẩm khách chọn đã ngừng bán hoặc không đủ tồn kho, cần đổi sang sản phẩm khác'
          : 'SKU không tồn tại, đã ngừng bán hoặc không đủ tồn kho',
      );
    }
    const product = await ProductModel.findOne({ _id: variant.productId, status: 'ACTIVE' }).select('name');
    if (!product) {
      throw new AppError('REPLACEMENT_PRODUCT_UNAVAILABLE', 409, 'Sản phẩm thay thế hiện không được kinh doanh');
    }
    doc.replacement.variantId = variant._id;
    doc.replacement.quantity = quantity;
    // Giữ giá khách đã thấy khi đặt yêu cầu; chỉ lấy giá hiện tại khi admin đổi sang sản phẩm khác.
    if (!keepCustomerChoice || doc.replacement.unitPrice == null) doc.replacement.unitPrice = variant.salePrice;
    doc.replacement.productName = product.name;
    doc.replacement.sku = variant.sku;
    doc.replacement.deliveredAt = null;
    // Chưa nối hãng vận chuyển: bỏ trống thì tự tạo mã nội bộ theo mã phiếu để đối chiếu hàng giao.
    const trackingCode = replacement.trackingCode?.trim() || generateReplacementTracking(doc.code);
    doc.replacement.trackingCode = trackingCode;
    doc.returnShipment.trackingCode = trackingCode;
  } else if (![ReturnStatus.CONFIRMED, ReturnStatus.AWAITING_GOODS].includes(doc.status as ReturnStatus)) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ cập nhật lịch lấy hàng hoặc vận đơn khi đã xác nhận');
  }
  if (input.costBearer) doc.costBearer = input.costBearer === 'SHOP' ? 'CARAVESO' : 'CUSTOMER';
  if (input.returnFee !== undefined) doc.returnShippingFee = input.returnFee;
  if (input.pickupSchedule !== undefined) doc.pickupSchedule = input.pickupSchedule ? new Date(input.pickupSchedule) : null;
  if (input.trackingCode !== undefined) doc.customerShipment.trackingCode = input.trackingCode;
  if (!input.replacement) {
    doc.status = ReturnStatus.AWAITING_GOODS;
    pushHistory(doc, ReturnStatus.AWAITING_GOODS, doc.pickupSchedule ? 'Đã đặt lịch lấy hàng' : 'Chờ nhận hàng từ khách');
  }
  await doc.save();
  await audit('RETURN_UPDATED', doc, actor);
  return toDto(doc);
}

/** Lý do thuộc về CaraVeso (FR-42): lỗi sản phẩm, giao sai, hư hại khi vận chuyển. */
const CARAVESO_FAULT_REASONS = ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT'];

/**
 * Bên chịu phí đổi/trả: theo lựa chọn của Order Admin; chưa chọn thì suy ra từ lý do của khách
 * (lỗi từ CaraVeso thì CaraVeso chịu, đổi ý thì khách chịu).
 */
export function effectiveCostBearer(doc: Pick<ReturnRequestDoc, 'costBearer' | 'reason'>): 'CARAVESO' | 'CUSTOMER' {
  return doc.costBearer ?? (CARAVESO_FAULT_REASONS.includes(doc.reason) ? 'CARAVESO' : 'CUSTOMER');
}

/** Số tiền tối đa được hoàn cho yêu cầu trả: giá trị sản phẩm trả trừ phí khách chịu. */
function maximumRefundOf(doc: ReturnRequestDocument, order: OrderDocument): number {
  const item = order.items.find((entry) => String(entry._id) === String(doc.orderItemId));
  if (!item) throw new AppError('ORDER_ITEM_NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong đơn');
  const gross = Math.round(item.finalAmount * doc.quantity / item.quantity);
  return Math.max(0, gross - (effectiveCostBearer(doc) === 'CUSTOMER' ? doc.returnShippingFee + doc.disassemblyFee : 0));
}

export async function receiveReturn(id: string, input: ReceiveReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (![ReturnStatus.CONFIRMED, ReturnStatus.AWAITING_GOODS].includes(doc.status as ReturnStatus)) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Yêu cầu phải được xác nhận trước khi kiểm tra');
  }
  doc.inspectionResult = input.inspectionResult;
  doc.description = input.note ?? doc.description;
  doc.status = ReturnStatus.PROCESSING;
  pushHistory(doc, ReturnStatus.PROCESSING, input.note ?? 'Đã nhận hàng và kiểm tra');
  await doc.save();
  await audit('RETURN_RECEIVED', doc, actor);
  return toDto(doc);
}

/**
 * Trả hàng, bước 3: hàng về kho và kiểm tra không có vấn đề thì duyệt hoàn tiền. Yêu cầu chuyển sang
 * "Chờ hoàn tiền" và khoản hoàn xuất hiện ở Thanh toán & đối soát để Order Admin xác nhận.
 */
export async function approveRefund(id: string, input: ApproveRefundInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'RETURN' || doc.status !== ReturnStatus.PROCESSING || !doc.inspectionResult) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ duyệt hoàn tiền cho yêu cầu trả hàng đã nhận và kiểm tra hàng');
  }
  const order = await OrderModel.findById(doc.orderId);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const maximumRefund = maximumRefundOf(doc, order);
  const amount = input.amount ?? maximumRefund;
  if (amount <= 0) {
    throw new AppError('REFUND_AMOUNT_INVALID', 400, 'Số tiền hoàn phải lớn hơn 0');
  }
  if (amount > maximumRefund) {
    throw new AppError('REFUND_AMOUNT_EXCEEDED', 400, 'Số tiền hoàn vượt quá số tiền khách đã thanh toán');
  }

  await requestRefund({
    order,
    amount,
    source: RefundSource.RETURN,
    returnRequestId: doc._id,
    refundAccount: doc.refundAccount,
    note: `Hoàn tiền yêu cầu ${doc.code}`,
  });
  doc.refundAmount = amount;
  doc.status = ReturnStatus.AWAITING_REFUND;
  pushHistory(doc, ReturnStatus.AWAITING_REFUND, input.note ?? 'Đã duyệt hoàn tiền, chờ xác nhận hoàn tiền');
  await doc.save();
  await audit('RETURN_REFUND_APPROVED', doc, actor);
  return toDto(doc);
}

/** Order Admin xác nhận hoàn tiền ở Thanh toán & đối soát: "Chờ hoàn tiền" -> "Đang hoàn tiền". */
export async function startReturnRefund(id: string, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'RETURN' || doc.status !== ReturnStatus.AWAITING_REFUND) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Yêu cầu trả hàng chưa ở trạng thái chờ hoàn tiền');
  }
  doc.status = ReturnStatus.REFUNDING;
  pushHistory(doc, ReturnStatus.REFUNDING, 'Đã xác nhận hoàn tiền, đang chuyển tiền cho khách');
  await doc.save();
  await audit('RETURN_REFUND_STARTED', doc, actor);
  return toDto(doc);
}

/**
 * Hoàn tất hoàn tiền (Order Admin báo thủ công vì chưa nối ngân hàng): giao dịch hoàn xong, yêu cầu
 * trả hàng tự chuyển "Hoàn tất" (thành công), đơn sang "Đã hoàn tiền" khi đã hoàn đủ.
 */
export async function refundReturn(id: string, input: RefundReturnInput, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'RETURN' || doc.status !== ReturnStatus.REFUNDING) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ hoàn tất hoàn tiền cho yêu cầu trả hàng đang hoàn tiền');
  }
  if (doc.refund.completed) {
    throw new AppError('REFUND_ALREADY_COMPLETED', 409, 'Yêu cầu này đã được hoàn tiền');
  }
  const order = await OrderModel.findById(doc.orderId);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const maximumRefund = maximumRefundOf(doc, order);
  const amount = input.amount ?? doc.refundAmount ?? maximumRefund;
  if (amount > maximumRefund) {
    throw new AppError('REFUND_AMOUNT_EXCEEDED', 400, 'Số tiền hoàn vượt quá số tiền khách đã thanh toán');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await ReturnRequestModel.findOne({
        _id: doc._id,
        status: ReturnStatus.REFUNDING,
        'refund.completed': false,
      }).session(session);
      if (!current) {
        throw new AppError('REFUND_ALREADY_COMPLETED', 409, 'Yêu cầu này đã được hoàn tiền hoặc thay đổi trạng thái');
      }
      const handler = await UserModel.findById(actor.userId).select('profile').session(session);
      const transactionAt = new Date(input.transactionAt);
      const refundTransaction = await PaymentTransactionModel.findOneAndUpdate(
        { returnRequestId: current._id, type: TransactionType.REFUND, status: RefundStatus.PROCESSING },
        {
          $set: {
            amount,
            recordSource: 'MANUAL',
            reconciliationStatus: ReconciliationStatus.MANUALLY_RESOLVED,
            status: RefundStatus.COMPLETED,
            proofImage: input.proofImage,
            handledById: actor.userId,
            handledByName: handler?.profile?.fullName ?? null,
            transactionAt,
          },
        },
        { session },
      );
      if (!refundTransaction) {
        throw new AppError('REFUND_TRANSACTION_MISSING', 409, 'Không tìm thấy khoản hoàn đang hoàn tiền của yêu cầu này');
      }

      current.refundAmount = amount;
      current.refund.proofImage = input.proofImage;
      current.refund.transactionAt = transactionAt;
      current.refund.completed = true;
      current.status = ReturnStatus.COMPLETED;
      current.completedAt = new Date();
      pushHistory(current, ReturnStatus.COMPLETED, 'Đã hoàn tiền cho khách');
      await current.save({ session });

      await settleOrderRefundStatus(order._id, session);
      Object.assign(doc, current.toObject());
    });
  } finally {
    await session.endSession();
  }
  await audit('RETURN_REFUNDED', doc, actor);
  return toDto(doc);
}

/**
 * Hoàn tất đổi hàng: tạo đơn mới giao sản phẩm thay thế cho khách. Giá trị hàng trả lại được trừ vào
 * đơn mới, phần chênh lệch thu COD khi giao. Đơn mới đi tiếp quy trình giao hàng bình thường.
 */
export async function completeReturn(id: string, actor: ActorContext): Promise<ReturnRequest> {
  const doc = await requireReturn(id);
  if (doc.type !== 'EXCHANGE' || doc.status !== ReturnStatus.PROCESSING) {
    throw new AppError('RETURN_INVALID_STATE', 409, 'Chỉ hoàn tất yêu cầu đổi hàng đang xử lý');
  }
  if (!doc.replacement.variantId || !doc.replacement.quantity) {
    throw new AppError('REPLACEMENT_DETAILS_REQUIRED', 400, 'Cần có sản phẩm thay thế trước khi hoàn tất');
  }
  const original = await OrderModel.findById(doc.orderId);
  if (!original) throw new AppError('ORDER_NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const originalItem = original.items.find((item) => String(item._id) === String(doc.orderItemId));
  if (!originalItem) throw new AppError('ORDER_ITEM_NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong đơn');
  const credit = Math.round((originalItem.finalAmount * doc.quantity) / originalItem.quantity);

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
      const completedAt = new Date();
      const trackingCode = current.returnShipment.trackingCode || generateReplacementTracking(current.code);
      const exchangeOrder = await createExchangeOrder({
        session,
        original,
        returnRequestId: current._id,
        returnCode: current.code,
        variantId: current.replacement.variantId!,
        quantity: current.replacement.quantity!,
        unitPrice: current.replacement.unitPrice ?? 0,
        credit,
        customerBearsShipping: effectiveCostBearer(current) === 'CUSTOMER',
        returnShippingFee: current.returnShippingFee,
        trackingCode,
        actorId: actor.userId,
        now: completedAt,
      });

      // Hàng cũ đã trả về: bảo hành của sản phẩm đó kết thúc. Sản phẩm thay thế được cấp phiếu bảo hành
      // mới khi đơn đổi hàng giao thành công.
      await WarrantyCardModel.updateOne(
        { orderId: current.orderId, orderItemId: current.orderItemId },
        { $set: { expiresAt: completedAt } },
        { session },
      );

      current.replacement.trackingCode = trackingCode;
      current.returnShipment.trackingCode = trackingCode;
      current.exchangeOrderId = exchangeOrder._id;
      current.status = ReturnStatus.COMPLETED;
      current.completedAt = completedAt;
      pushHistory(current, ReturnStatus.COMPLETED, `Đã tạo đơn đổi hàng ${exchangeOrder.orderCode}`);
      await current.save({ session });
      Object.assign(doc, current.toObject());
    });
  } finally {
    await session.endSession();
  }
  await audit('RETURN_COMPLETED', doc, actor);
  return toDto(doc);
}
