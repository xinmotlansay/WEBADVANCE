import mongoose, { type Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import {
  OrderModel,
  ReturnRequestModel,
  ShipmentModel,
  type OrderDoc,
  type ReturnRequestDoc,
} from './after-sales.model.js';
import { SystemConfigModel } from '../config/system-config.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { getProductDetail } from '../products/product.service.js';
import { timeline, validateEvidence } from './warranty.service.js';
import type { z } from 'zod';
import type { returnSchema } from './after-sales.schema.js';

export function isReturnEligible(
  status: string,
  deliveredAt: Date | undefined,
  returnDays: number,
  now = new Date(),
): boolean {
  return (
    status === 'DELIVERED' &&
    !!deliveredAt &&
    deliveredAt.getTime() <= now.getTime() &&
    now.getTime() <= deliveredAt.getTime() + returnDays * 86400000
  );
}
export function availableQuantity(
  purchased: number,
  previous: { quantity: number; status: string }[],
): number {
  return Math.max(
    0,
    purchased -
      previous
        .filter((r) => !['REJECTED', 'CANCELLED'].includes(r.status))
        .reduce((n, r) => n + r.quantity, 0),
  );
}
export async function returnDays(): Promise<number> {
  const value = (await SystemConfigModel.findById('policy.returnDays').lean())?.value;
  return typeof value === 'number' && value >= 0 ? value : 7;
}
export async function eligibleOrder(order: OrderDoc) {
  const [shipment, days, previous] = await Promise.all([
    ShipmentModel.findOne({ orderId: order._id }).lean(),
    returnDays(),
    ReturnRequestModel.find({ orderId: order._id }).lean(),
  ]);
  const eligible = isReturnEligible(order.status, shipment?.actualDeliveryDate, days);
  return {
    id: order._id.toString(),
    orderCode: order.orderCode,
    status: order.status,
    actualDeliveryDate: shipment?.actualDeliveryDate ?? null,
    returnDeadline: shipment?.actualDeliveryDate
      ? new Date(shipment.actualDeliveryDate.getTime() + days * 86400000)
      : null,
    items: order.items.map((item) => {
      const remaining = availableQuantity(
        item.quantity,
        previous.filter((r) => r.orderItemId.equals(item._id)),
      );
      return {
        id: item._id.toString(),
        name: item.snapshot.name,
        quantity: item.quantity,
        returnableQuantity: eligible ? remaining : 0,
        actions: { canReturn: eligible && remaining > 0 },
      };
    }),
  };
}
export async function createReturn(userId: Types.ObjectId, body: z.infer<typeof returnSchema>) {
  const files = await validateEvidence(userId, body.evidence, 'RETURN_EVIDENCE');
  if (
    ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT'].includes(body.reason) &&
    !files.some((f) => f.mime.startsWith('video/'))
  )
    throw new AppError(
      'VIDEO_REQUIRED',
      400,
      'Lỗi sản phẩm, giao sai hoặc hư hại vận chuyển cần video mở hàng',
    );
  const days = await returnDays();
  return mongoose.connection.transaction(async (session) => {
    const order = await OrderModel.findOneAndUpdate(
      { _id: body.orderId, userId },
      { $inc: { afterSalesVersion: 1 } },
      { new: true, session },
    ).lean();
    if (!order) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
    const shipment = await ShipmentModel.findOne({ orderId: order._id }).session(session).lean();
    if (!isReturnEligible(order.status, shipment?.actualDeliveryDate, days))
      throw new AppError(
        'RETURN_WINDOW_EXPIRED',
        409,
        'Đơn chưa giao thành công hoặc đã hết thời hạn đổi trả',
      );
    const item = order.items.find((i) => i._id.toString() === body.orderItemId);
    if (!item) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong đơn');
    const previous = await ReturnRequestModel.find({ orderId: order._id, orderItemId: item._id })
      .session(session)
      .lean();
    if (body.quantity > availableQuantity(item.quantity, previous))
      throw new AppError(
        'RETURN_QUANTITY_EXCEEDED',
        409,
        'Số lượng vượt quá số còn có thể đổi trả',
      );
    let replacement: ReturnRequestDoc['replacement'];
    if (body.type === 'EXCHANGE') {
      const variant = await VariantModel.findOne({
        _id: body.replacementVariantId,
        status: 'ACTIVE',
      })
        .session(session)
        .lean();
      const product = variant
        ? await ProductModel.findOne({ _id: variant.productId, status: 'ACTIVE' })
            .session(session)
            .lean()
        : null;
      const detail = product ? await getProductDetail(product.slug) : null;
      const price = detail?.variants.find((v) => v.id === body.replacementVariantId)?.price.final;
      if (
        !variant ||
        !product ||
        price === undefined ||
        variant.stockQuantity < body.quantity ||
        price < item.finalAmount / item.quantity
      )
        throw new AppError(
          'REPLACEMENT_NOT_ELIGIBLE',
          409,
          'Sản phẩm thay thế phải còn đủ hàng và có giá ngang hoặc cao hơn giá thực trả',
        );
      replacement = { variantId: variant._id, quantity: body.quantity, unitPrice: price };
    }
    const { replacementVariantId: _variantId, ...input } = body;
    const [request] = await ReturnRequestModel.create(
      [
        {
          ...input,
          userId,
          status: 'PENDING',
          replacement,
          requestedAt: new Date(),
          timeline: [{ status: 'PENDING', at: new Date() }],
        },
      ],
      { session },
    );
    return { id: request._id.toString(), status: request.status };
  });
}
export async function returnRequestDto(request: ReturnRequestDoc) {
  const order = await OrderModel.findById(request.orderId).lean();
  const bank = request.refundAccount;
  // Explicit public DTO prevents internal bank data and admin notes from leaking.
  return {
    id: request._id.toString(),
    orderId: request.orderId.toString(),
    orderItemId: request.orderItemId.toString(),
    productName:
      order?.items.find((i) => i._id.equals(request.orderItemId))?.snapshot.name ?? 'Sản phẩm',
    type: request.type,
    quantity: request.quantity,
    reason: request.reason,
    description: request.description,
    evidence: request.evidence,
    contact: request.contact ?? { name: order?.shippingAddress?.recipientName ?? '', phone: order?.shippingAddress?.recipientPhone ?? '', address: order?.shippingAddress?.addressLine ?? '' },
    status: request.status,
    requestedAt: request.requestedAt,
    rejectReason: request.rejectReason,
    resolution: request.resolution,
    refundAmount: request.refundAmount,
    refundAccount: bank
      ? {
          bankName: bank.bankName,
          accountHolder: bank.accountHolder,
          accountNumber: bank.accountNumber ? '******' + bank.accountNumber.slice(-4) : '',
        }
      : undefined,
    canCancel: request.status === 'PENDING',
    timeline: timeline(request, 'PENDING'),
  };
}
