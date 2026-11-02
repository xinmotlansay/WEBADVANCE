import type { OrderDetail, OrderListItem, OrderPaymentSummary } from '../../lib/shared-types.js';
import { DeliverySlot, OrderStatus } from '../../lib/shared-enums.js';
import {
  toSharedCancellationActor,
  toSharedCollectionType,
  toSharedOrderStatus,
  toSharedPaymentMethod,
  toSharedPaymentStatus,
  type OrderDoc,
  type OrderItemDoc,
} from './order.model.js';
import type { ShipmentDoc } from './shipment.model.js';
import { allowedNext, isOverdueConfirmation } from './order.rules.js';

export interface OrderCustomerView {
  _id: unknown;
  profile?: { fullName?: string } | null;
  email?: string | null;
  phoneNumber?: string | null;
}

function customerId(customer: OrderCustomerView): string {
  return String(customer._id);
}

function customerName(customer: OrderCustomerView): string {
  return customer.profile?.fullName?.trim() || 'Khách hàng';
}

function toItem(item: OrderItemDoc) {
  return {
    id: String(item._id),
    variantId: String(item.variantId),
    name: item.snapshot?.name ?? '',
    sku: item.snapshot?.sku ?? '',
    color: item.snapshot?.color ?? null,
    material: item.snapshot?.material ?? null,
    dimensions: item.snapshot?.dimensions ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    promotionDiscount: item.promotionDiscount ?? 0,
    voucherDiscountShare: item.voucherDiscountShare ?? 0,
    finalAmount: item.finalAmount,
    shippingTier: item.shippingTier ?? 1,
    shippingFee: item.shippingFee ?? 0,
    hasInstallation: item.hasInstallation ?? false,
    installationFee: item.installationFee ?? 0,
    warrantyMonths: item.warrantyMonths,
    imageUrl: item.snapshot?.imageUrl ?? null,
  };
}

export function toOrderListItem(order: OrderDoc, customer: OrderCustomerView): OrderListItem {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerId: customerId(customer),
    customerName: customerName(customer),
    customerPhone: order.shippingAddress.recipientPhone || customer.phoneNumber || '',
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: order.totalAmount,
    status: toSharedOrderStatus(order.status),
    paymentStatus: toSharedPaymentStatus(order.payment.status),
    paymentMethod: toSharedPaymentMethod(order.payment.method),
    createdAt: order.createdAt.toISOString(),
    isOverdue: isOverdueConfirmation(toSharedOrderStatus(order.status), order.createdAt),
  };
}

export function toPaymentSummary(
  order: OrderDoc,
  refund?: OrderPaymentSummary['refund'],
): OrderPaymentSummary {
  return {
    method: toSharedPaymentMethod(order.payment.method),
    collectionType: toSharedCollectionType(order.payment.collectionType),
    status: toSharedPaymentStatus(order.payment.status),
    depositAmount: order.payment.depositAmount ?? null,
    codAmount: order.payment.codAmount ?? null,
    dueAt: order.payment.dueAt ? order.payment.dueAt.toISOString() : null,
    transferContent: order.payment.transferContent ?? null,
    lastTransactionCode: order.payment.lastTransactionCode ?? null,
    paidAt: order.payment.paidAt ? order.payment.paidAt.toISOString() : null,
    refund: refund ?? null,
  };
}

export function toOrderDetail(
  order: OrderDoc,
  customer: OrderCustomerView,
  shipment: ShipmentDoc | null,
  options: { refund?: OrderPaymentSummary['refund']; invoiceNumber?: string | null } = {},
): OrderDetail {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customer: {
      id: customerId(customer),
      fullName: customerName(customer),
      email: customer.email ?? null,
      phoneNumber: order.shippingAddress.recipientPhone || customer.phoneNumber || '',
    },
    shippingAddress: {
      recipientName: order.shippingAddress.recipientName,
      recipientPhone: order.shippingAddress.recipientPhone,
      email: order.shippingAddress.email ?? null,
      addressLine: order.shippingAddress.addressLine,
      ward: order.shippingAddress.ward,
      district: order.shippingAddress.district ?? '',
      province: order.shippingAddress.province,
    },
    items: order.items.map(toItem),
    totals: {
      subtotal: order.subtotal,
      promotionDiscount: order.promotionDiscount,
      voucherDiscount: order.voucherDiscount,
      shippingFee: order.shippingFee,
      installationFee: order.installationFee,
      totalAmount: order.totalAmount,
    },
    status: toSharedOrderStatus(order.status),
    allowedNext: allowedNext(toSharedOrderStatus(order.status)),
    note: order.note ?? null,
    payment: toPaymentSummary(order, options.refund),
    shipment: shipment
      ? {
          id: String(shipment._id),
          carrier: shipment.carrier ?? null,
          trackingCode: shipment.trackingCode ?? null,
          assignedTeam: shipment.assignedTeam ?? null,
          status: shipment.status,
          estimatedDeliveryDate: shipment.estimatedDeliveryDate
            ? shipment.estimatedDeliveryDate.toISOString()
            : null,
          scheduledDate: shipment.scheduledDate ? shipment.scheduledDate.toISOString() : null,
          scheduledSlot: shipment.scheduledSlot ? DeliverySlot[shipment.scheduledSlot] : null,
          rescheduleCount: shipment.rescheduleCount ?? 0,
          redeliveryCount: shipment.redeliveryCount ?? 0,
          failureReason: shipment.failureReason ?? null,
          actualShippingCost: shipment.actualShippingCost ?? null,
          actualDeliveryDate: shipment.actualDeliveryDate
            ? shipment.actualDeliveryDate.toISOString()
            : null,
          installationSchedule: shipment.installationSchedule
            ? shipment.installationSchedule.toISOString()
            : null,
        }
      : null,
    statusHistory: (order.statusHistory ?? []).map((entry) => ({
      at: entry.changedAt.toISOString(),
      fromStatus: entry.fromStatus ? toSharedOrderStatus(entry.fromStatus) : null,
      toStatus: toSharedOrderStatus(entry.toStatus),
      note: entry.note ?? null,
      changedBy: entry.changedBy ? String(entry.changedBy) : null,
    })),
    cancellation: order.cancellation?.cancelledAt
      ? {
          reason: order.cancellation.reason ?? null,
          note: order.cancellation.note ?? null,
          cancelledBy: toSharedCancellationActor(order.cancellation.cancelledBy),
          cancelledAt: order.cancellation.cancelledAt.toISOString(),
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    invoiceNumber: options.invoiceNumber ?? null,
  };
}

export const TERMINAL_STATUSES: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
