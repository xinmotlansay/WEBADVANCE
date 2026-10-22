import { Types } from 'mongoose';
import { AddressModel } from '../addresses/address.model.js';
import { CartModel } from '../cart/cart.model.js';
import {
  isBlocking,
  isItemSelected,
  lineDisplay,
  lineWarnings,
  toPricingInput,
  type CartItemView,
  type CartWarning,
} from '../cart/cart.service.js';
import { getCheckoutConfig, type CheckoutConfig } from '../config/config.service.js';
import { OrderModel, type InvoiceInfo, type ShippingAddress } from '../orders/order.model.js';
import type { CheckoutBody } from './checkout.schema.js';
import {
  isValidSchedule,
  quoteDelivery,
  type DateOnly,
  type DeliveryQuote,
  type DeliverySlot,
} from './delivery.js';
import { loadLineContexts, type LineContext } from './line-context.js';
import {
  priceLines,
  resolveInstallation,
  type PaymentQuote,
  type PricedLine,
  type PriceSummary,
} from './pricing.js';

export type BlockingCode =
  | 'NO_ITEMS'
  | 'OUT_OF_STOCK'
  | 'EXCEEDS_STOCK'
  | 'VARIANT_UNAVAILABLE'
  | 'ADDRESS_REQUIRED'
  | 'SCHEDULE_INVALID';

export interface BlockingIssue {
  code: BlockingCode;
  variantId?: string;
  /** Chỉ có với `EXCEEDS_STOCK`. */
  available?: number;
}

export interface CheckoutItemView extends Pick<CartItemView, 'product' | 'variant'> {
  /** Dòng giỏ tương ứng (nguồn `CART`) để sửa qua API giỏ; `null` với `BUY_NOW`. */
  cartItemId: string | null;
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
  pricing: PricedLine['pricing'];
  shippingTier: number;
  shippingFee: number;
  installationFee: number;
  voucherDiscountShare: number;
  finalAmount: number;
  warnings: CartWarning[];
  available?: number;
}

export interface CheckoutPreview {
  source: CheckoutBody['source'];
  items: CheckoutItemView[];
  summary: PriceSummary;
  /** Voucher (FR-30) làm sau. */
  voucher: null;
  payment: PaymentQuote;
  delivery: DeliveryQuote;
  /** Địa chỉ sẽ giao: `addressId`, `newAddress` hoặc địa chỉ mặc định. */
  address: (ShippingAddress & { id: string | null }) | null;
  blockingIssues: BlockingIssue[];
  lastInvoiceInfo: InvoiceInfo | null;
}

export interface CheckoutLine {
  ctx: LineContext;
  priced: PricedLine;
}

export interface CheckoutResult {
  preview: CheckoutPreview;
  lines: CheckoutLine[];
  schedule: { scheduledDate: DateOnly; scheduledSlot: DeliverySlot } | null;
  config: CheckoutConfig;
}

interface RequestedLine {
  cartItemId: string | null;
  variantId: Types.ObjectId;
  quantity: number;
  hasInstallation: boolean;
  /** Giá lúc thêm vào giỏ để báo `PRICE_CHANGED`; mua nhanh không có. */
  priceAtAdd: number | null;
}

async function requestedLines(
  userId: Types.ObjectId,
  body: CheckoutBody,
): Promise<RequestedLine[]> {
  if (body.source === 'BUY_NOW') {
    return (body.items ?? []).map((i) => ({
      cartItemId: null,
      variantId: new Types.ObjectId(i.variantId),
      quantity: i.quantity,
      hasInstallation: i.hasInstallation,
      priceAtAdd: null,
    }));
  }
  const cart = await CartModel.findOne({ userId });
  return (cart?.items ?? []).filter(isItemSelected).map((i) => ({
    cartItemId: i._id.toString(),
    variantId: i.variantId,
    quantity: i.quantity,
    hasInstallation: i.hasInstallation,
    priceAtAdd: i.priceAtAdd,
  }));
}

async function resolveAddress(
  userId: Types.ObjectId,
  body: CheckoutBody,
): Promise<CheckoutPreview['address']> {
  if (body.newAddress && !body.addressId) {
    const { saveAddress: _, ...address } = body.newAddress;
    return { id: null, ...address };
  }
  const doc = await AddressModel.findOne(
    body.addressId ? { _id: body.addressId, userId } : { userId, isDefault: true },
  ).lean();
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    recipientName: doc.recipientName,
    recipientPhone: doc.recipientPhone,
    addressLine: doc.addressLine,
    ward: doc.ward,
    district: doc.district,
    province: doc.province,
  };
}

/** BR-V06: điền sẵn thông tin hóa đơn từ đơn gần nhất có xuất hóa đơn. */
async function lastInvoiceInfo(userId: Types.ObjectId): Promise<InvoiceInfo | null> {
  const order = await OrderModel.findOne({ userId, 'invoiceInfo.type': { $ne: 'NONE' } })
    .sort({ _id: -1 })
    .select('invoiceInfo')
    .lean();
  return order?.invoiceInfo ?? null;
}

/**
 * Tính lại toàn bộ đơn từ dữ liệu hiện tại (API Design 8.2). Dùng chung cho `POST /checkout/preview`
 * và `POST /orders`; không ghi gì, không giữ hàng.
 */
export async function buildCheckout(
  userId: Types.ObjectId,
  body: CheckoutBody,
  now = new Date(),
): Promise<CheckoutResult> {
  const requested = await requestedLines(userId, body);
  const [contexts, config, address, invoiceInfo] = await Promise.all([
    loadLineContexts(
      requested.map((r) => r.variantId),
      now,
    ),
    getCheckoutConfig(),
    resolveAddress(userId, body),
    lastInvoiceInfo(userId),
  ]);

  const issues: BlockingIssue[] = [];
  if (requested.length === 0) issues.push({ code: 'NO_ITEMS' });

  const rows = requested.flatMap((req) => {
    const variantId = req.variantId.toString();
    const ctx = contexts.get(variantId);
    if (!ctx?.variant.shippingTier) {
      issues.push({ code: 'VARIANT_UNAVAILABLE', variantId });
      return [];
    }
    const hasInstallation = resolveInstallation(
      ctx.variant.installationService,
      req.hasInstallation,
    );
    const warnings = lineWarnings(ctx, req.quantity, req.priceAtAdd ?? ctx.finalPrice);
    for (const code of warnings) {
      if (!isBlocking([code])) continue;
      issues.push({
        code: code as BlockingCode,
        variantId,
        ...(code === 'EXCEEDS_STOCK' ? { available: ctx.variant.stockQuantity } : {}),
      });
    }
    return [{ req, ctx, hasInstallation, warnings }];
  });

  const { shipping, payment } = config;
  const priced = priceLines(
    rows.map((r) =>
      toPricingInput(r.ctx, { quantity: r.req.quantity, hasInstallation: r.hasInstallation }),
    ),
    shipping,
    payment,
  );
  const delivery = quoteDelivery(
    rows.map((r) => r.ctx.variant.shippingTier ?? 0),
    shipping,
    now,
  );
  const schedule = body.delivery ?? null;
  if (schedule && !isValidSchedule(schedule, delivery)) issues.push({ code: 'SCHEDULE_INVALID' });
  if (!address) issues.push({ code: 'ADDRESS_REQUIRED' });

  const items = rows.map(({ req, ctx, warnings }, i): CheckoutItemView => {
    const line = priced.items[i]!;
    return {
      cartItemId: req.cartItemId,
      variantId: line.variantId,
      quantity: line.quantity,
      hasInstallation: line.hasInstallation,
      ...lineDisplay(ctx),
      pricing: line.pricing,
      shippingTier: line.shippingTier,
      shippingFee: line.shippingFee,
      installationFee: line.installationFee,
      voucherDiscountShare: line.voucherDiscountShare,
      finalAmount: line.finalAmount,
      warnings,
      ...(warnings.includes('EXCEEDS_STOCK') ? { available: ctx.variant.stockQuantity } : {}),
    };
  });

  return {
    preview: {
      source: body.source,
      items,
      summary: priced.summary,
      voucher: null,
      payment: priced.payment,
      delivery,
      address,
      blockingIssues: issues,
      lastInvoiceInfo: invoiceInfo,
    },
    lines: rows.map((r, i) => ({ ctx: r.ctx, priced: priced.items[i]! })),
    schedule,
    config,
  };
}
