import { randomInt } from 'node:crypto';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { createAddress } from '../addresses/address.service.js';
import { CartModel } from '../cart/cart.model.js';
import { lineDisplay } from '../cart/cart.service.js';
import type { CreateOrderBody } from '../checkout/checkout.schema.js';
import {
  buildCheckout,
  type BlockingIssue,
  type CheckoutPreview,
} from '../checkout/checkout.service.js';
import {
  addDays,
  isSchedulable,
  isValidSchedule,
  vnToday,
  type DateOnly,
  type DeliverySlot,
} from '../checkout/delivery.js';
import { resolvePayment } from '../checkout/pricing.js';
import { getCheckoutConfig, type BankAccountConfig } from '../config/config.service.js';
import { StockHistoryModel, type StockChangeType } from '../products/stock-history.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { formatDimensions } from '../cart/cart.service.js';
import { notifyStockLevelsInBackground } from '../admin/admin-inventory.service.js';
import { consumeVoucher, refundVoucherUsage } from '../vouchers/voucher.service.js';
import { MAX_EMAIL_ATTEMPTS } from '../invoices/invoice.service.js';
import { InvoiceModel, OrderModel, type OrderDoc, type OrderStatus } from './order.model.js';
import { RefundSource } from '../../lib/shared-enums.js';
import { paidAmountOf } from '../payments/payment.rules.js';
import { findOrderRefunds, requestRefund } from '../payments/refund.service.js';
import { getItemActions } from './order-history.js';
import { ShipmentModel } from './shipment.model.js';

export interface QrInfo {
  imageUrl: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  transferContent: string;
}

/** Response `POST /orders` và `GET /orders/:id/payment` (API Design 8.3, 8.4). */
export interface OrderPaymentView {
  id: string;
  orderCode: string;
  status: OrderStatus;
  source: OrderDoc['source'];
  totalAmount: number;
  payment: {
    method: OrderDoc['payment']['method'];
    collectionType: OrderDoc['payment']['collectionType'];
    status: OrderDoc['payment']['status'];
    /** Số tiền chuyển qua QR (tiền cọc nếu đặt cọc); với COD là số tiền thu khi nhận hàng. */
    amountDue: number;
    dueAt: string | null;
    secondsRemaining: number;
    qr: QrInfo | null;
  };
  paid: boolean;
  /** Đơn bị hệ thống hủy vì quá hạn thanh toán. */
  expired: boolean;
}

/** Khách tự hủy được khi đơn chưa bàn giao vận chuyển (FR-37). */
const CUSTOMER_CANCELLABLE: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
];

const isPaid = (order: Pick<OrderDoc, 'payment'>): boolean =>
  order.payment.status === 'PAID' || order.payment.status === 'DEPOSITED';

export const amountDue = (order: Pick<OrderDoc, 'payment' | 'totalAmount'>): number =>
  order.payment.collectionType === 'DEPOSIT'
    ? (order.payment.depositAmount ?? 0)
    : order.totalAmount;

const toDate = (d: DateOnly): Date => new Date(`${d}T00:00:00Z`);
const fromDate = (d: Date): DateOnly => d.toISOString().slice(0, 10);

function vietQrUrl(bank: BankAccountConfig, amount: number, content: string): string {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
    accountName: bank.accountHolder,
  });
  return `https://img.vietqr.io/image/${bank.bankId}-${bank.accountNumber}-compact2.png?${params}`;
}

export function toPaymentView(
  order: OrderDoc,
  bank: BankAccountConfig,
  now = new Date(),
): OrderPaymentView {
  const { payment } = order;
  const due = amountDue(order);
  const waiting = order.status === 'PENDING_PAYMENT' && !!payment.dueAt;
  return {
    id: order._id.toString(),
    orderCode: order.orderCode,
    status: order.status,
    source: order.source,
    totalAmount: order.totalAmount,
    payment: {
      method: payment.method,
      collectionType: payment.collectionType,
      status: payment.status,
      amountDue: payment.method === 'COD' ? (payment.codAmount ?? order.totalAmount) : due,
      dueAt: payment.dueAt?.toISOString() ?? null,
      secondsRemaining: waiting
        ? Math.max(0, Math.ceil((payment.dueAt!.getTime() - now.getTime()) / 1000))
        : 0,
      qr:
        payment.method === 'BANK_TRANSFER' && payment.transferContent
          ? {
              imageUrl: vietQrUrl(bank, due, payment.transferContent),
              bankName: bank.bankName,
              accountNumber: bank.accountNumber,
              accountHolder: bank.accountHolder,
              transferContent: payment.transferContent,
            }
          : null,
    },
    paid: isPaid(order),
    expired: order.status === 'CANCELLED' && order.cancellation?.cancelledBy === 'SYSTEM',
  };
}

/** `CV` + ngày (giờ VN, YYMMDD) + số thứ tự trong ngày, ví dụ `CV261017-0001`. */
async function nextOrderCode(now: Date, session: ClientSession): Promise<string> {
  const day = vnToday(now).replaceAll('-', '').slice(2);
  const counter = await mongoose.connection
    .collection<{ _id: string; seq: number }>('counters')
    .findOneAndUpdate(
      { _id: `order:${day}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', session },
    );
  return `CV${day}-${String(counter!.seq).padStart(4, '0')}`;
}

/** Nội dung chuyển khoản duy nhất: mã đơn + 4 ký tự ngẫu nhiên, ví dụ `CV261017-0001-K7Q2`. */
function transferContentFor(orderCode: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${orderCode}-${suffix}`;
}

/** Cộng/trừ tồn kho có điều kiện và ghi `stock_histories` (API Design 0.5). */
async function changeStock(
  session: ClientSession,
  orderId: Types.ObjectId,
  variantId: Types.ObjectId,
  quantityChange: number,
  changeType: StockChangeType,
): Promise<boolean> {
  const variant = await VariantModel.findOneAndUpdate(
    quantityChange < 0
      ? { _id: variantId, status: 'ACTIVE', stockQuantity: { $gte: -quantityChange } }
      : { _id: variantId },
    { $inc: { stockQuantity: quantityChange } },
    { new: true, session },
  );
  if (!variant) return false;
  await StockHistoryModel.create(
    [
      {
        variantId,
        orderId,
        changeType,
        quantityChange,
        quantityAfter: variant.stockQuantity,
        performedAt: new Date(),
      },
    ],
    { session },
  );
  return true;
}

function blockingError(issue: BlockingIssue, preview: CheckoutPreview): AppError {
  const details = { ...issue, preview };
  switch (issue.code) {
    case 'OUT_OF_STOCK':
    case 'EXCEEDS_STOCK':
      return new AppError('INSUFFICIENT_STOCK', 409, 'Có sản phẩm không đủ hàng', details);
    case 'VARIANT_UNAVAILABLE':
      return new AppError('VARIANT_UNAVAILABLE', 409, 'Có sản phẩm đã ngừng bán', details);
    case 'VOUCHER_INVALID':
      return new AppError(
        'VOUCHER_INVALID',
        409,
        issue.message ?? 'Mã giảm giá không hợp lệ',
        details,
      );
    case 'ADDRESS_REQUIRED':
      return new AppError('ADDRESS_REQUIRED', 400, 'Chưa có địa chỉ giao hàng', details);
    case 'SCHEDULE_INVALID':
      return new AppError('SCHEDULE_INVALID', 400, 'Lịch hẹn giao không hợp lệ', details);
    case 'NO_ITEMS':
      return new AppError('VALIDATION_ERROR', 400, 'Chưa có sản phẩm để đặt', details);
  }
}

const isDuplicateKey = (err: unknown, field: string): boolean =>
  (err as { code?: number }).code === 11000 &&
  field in ((err as { keyPattern?: object }).keyPattern ?? {});

export interface ExchangeOrderInput {
  session: ClientSession;
  /** Đơn gốc có sản phẩm khách trả lại: lấy địa chỉ và khách của đơn này. */
  original: Pick<OrderDoc, '_id' | 'userId' | 'orderCode' | 'shippingAddress'>;
  returnRequestId: Types.ObjectId;
  returnCode: string;
  variantId: Types.ObjectId;
  quantity: number;
  /** Giá sản phẩm thay thế khách đã thấy khi gửi yêu cầu. */
  unitPrice: number;
  /** Giá trị hàng khách trả lại, trừ vào đơn mới. */
  credit: number;
  /** Khách chịu phí (đổi ý): đơn mới tính phí giao theo cấp vận chuyển của sản phẩm như đơn thường. */
  customerBearsShipping: boolean;
  /** Phí lấy hàng/hoàn do Order Admin nhập, chỉ thu khi khách chịu phí. */
  returnShippingFee: number;
  trackingCode: string;
  actorId: string | null;
  now?: Date;
}

/** Phí giao hàng của sản phẩm thay thế theo cấp vận chuyển (cùng bảng phí với đơn thường). */
export async function exchangeDeliveryFee(variantId: Types.ObjectId, quantity: number): Promise<number> {
  const variant = await VariantModel.findById(variantId).select('shippingTier').lean();
  const { shipping } = await getCheckoutConfig();
  const fee = shipping.tiers.find((tier) => tier.tier === variant?.shippingTier)?.fee ?? 0;
  return fee * quantity;
}

/**
 * Hoàn tất đổi hàng: tạo đơn mới giao sản phẩm thay thế cho khách. Giá trị hàng trả lại được trừ vào
 * đơn mới; phần chênh lệch (và phí hoàn nếu khách chịu) thu COD khi giao. Chạy trong transaction của
 * phiếu đổi trả nên trừ kho, tạo đơn và đóng phiếu cùng thành công hoặc cùng hủy.
 */
export async function createExchangeOrder(input: ExchangeOrderInput): Promise<OrderDoc> {
  const { session, original } = input;
  const now = input.now ?? new Date();

  const variant = await VariantModel.findOne({ _id: input.variantId, status: 'ACTIVE' }).session(session).lean();
  const product = variant
    ? await ProductModel.findOne({ _id: variant.productId, status: 'ACTIVE' }).session(session).lean()
    : null;
  if (!variant || !product) {
    throw new AppError('REPLACEMENT_PRODUCT_UNAVAILABLE', 409, 'Sản phẩm thay thế hiện không được kinh doanh');
  }

  const orderId = new mongoose.Types.ObjectId();
  const stockOk = await changeStock(session, orderId, variant._id, -input.quantity, 'SALE');
  if (!stockOk) {
    throw new AppError('REPLACEMENT_STOCK_UNAVAILABLE', 409, 'Không đủ tồn kho để giao sản phẩm thay thế');
  }

  const subtotal = input.unitPrice * input.quantity;
  const exchangeCredit = Math.min(input.credit, subtotal);
  // Lỗi từ CaraVeso: CaraVeso chịu toàn bộ phí. Khách đổi ý: khách chịu phí giao hàng theo cấp vận chuyển
  // và phí lấy hàng (nếu có) (FR-42).
  const deliveryFee = input.customerBearsShipping ? await exchangeDeliveryFee(variant._id, input.quantity) : 0;
  const shippingFee = deliveryFee + (input.customerBearsShipping ? input.returnShippingFee : 0);
  const totalAmount = subtotal - exchangeCredit + shippingFee;
  const note = `Đơn đổi hàng từ phiếu ${input.returnCode} (đơn gốc ${original.orderCode}). Khách chỉ thanh toán phần chênh lệch khi nhận hàng.`;
  const orderCode = await nextOrderCode(now, session);

  const [created] = await OrderModel.create(
    [
      {
        _id: orderId,
        orderCode,
        userId: original.userId,
        idempotencyKey: `exchange:${input.returnRequestId.toString()}`,
        shippingAddress: original.shippingAddress,
        subtotal,
        promotionDiscount: 0,
        voucherDiscount: 0,
        shippingFee,
        installationFee: 0,
        exchangeCredit,
        exchangeFrom: {
          returnRequestId: input.returnRequestId,
          orderId: original._id,
          returnCode: input.returnCode,
        },
        totalAmount,
        // Phiếu đã được Order Admin duyệt và kiểm hàng nên đơn mới vào thẳng "Đã xác nhận".
        status: 'CONFIRMED',
        note,
        source: 'EXCHANGE',
        invoiceInfo: { type: 'NONE' },
        items: [
          {
            variantId: variant._id,
            snapshot: {
              name: product.name,
              sku: variant.sku,
              color: variant.color ?? undefined,
              material: variant.material ?? undefined,
              dimensions: formatDimensions(variant.dimensions) ?? undefined,
            },
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            promotionDiscount: 0,
            voucherDiscountShare: 0,
            finalAmount: subtotal,
            shippingTier: variant.shippingTier,
            shippingFee: deliveryFee,
            hasInstallation: false,
            installationFee: 0,
            warrantyMonths: product.warrantyMonths,
          },
        ],
        statusHistory: [
          {
            changedBy: input.actorId ? new mongoose.Types.ObjectId(input.actorId) : null,
            toStatus: 'CONFIRMED',
            note: `Tạo từ phiếu đổi hàng ${input.returnCode}`,
            changedAt: now,
          },
        ],
        // Thu COD phần còn lại khi giao; không còn gì phải thu thì coi như đã thanh toán.
        payment: {
          method: 'COD',
          collectionType: 'FULL',
          status: totalAmount > 0 ? 'UNPAID' : 'PAID',
          codAmount: totalAmount,
          ...(totalAmount > 0 ? {} : { paidAt: now }),
        },
      },
    ],
    { session },
  );

  await ShipmentModel.create(
    [
      {
        orderId,
        trackingCode: input.trackingCode,
        estimatedDeliveryDate: toDate(vnToday(new Date(now.getTime() + 3 * 86_400_000))),
      },
    ],
    { session },
  );
  return created!;
}

/** FR-31, API Design 8.3. Gửi lại cùng `Idempotency-Key` trả lại đơn cũ. */
export async function createOrder(
  userId: Types.ObjectId,
  idempotencyKey: string,
  body: CreateOrderBody,
  now = new Date(),
): Promise<{ created: boolean; view: OrderPaymentView }> {
  const replay = async () => {
    const existing = await OrderModel.findOne({ userId, idempotencyKey });
    if (!existing) return null;
    const { bankAccount } = await getCheckoutConfig();
    return { created: false, view: toPaymentView(existing, bankAccount, now) };
  };
  const previous = await replay();
  if (previous) return previous;

  const { preview, voucher, lines, schedule, config } = await buildCheckout(userId, body, now);
  const issue = preview.blockingIssues[0];
  if (issue) throw blockingError(issue, preview);
  if (body.expectedTotal !== preview.summary.totalAmount) {
    throw new AppError('PRICE_CHANGED', 409, 'Giá đã thay đổi, vui lòng kiểm tra lại', { preview });
  }
  const { summary, delivery } = preview;
  const pay = resolvePayment(summary.totalAmount, preview.payment, body.payment);
  const { id: _, ...address } = preview.address!;
  const isQr = pay.method === 'BANK_TRANSFER';
  const status: OrderStatus = isQr ? 'PENDING_PAYMENT' : 'PENDING_CONFIRMATION';
  const hasInstallation = lines.some((l) => l.priced.hasInstallation);

  let order: OrderDoc;
  try {
    order = await mongoose.connection.transaction(async (session) => {
      const orderId = new mongoose.Types.ObjectId();
      for (const { ctx, priced } of lines) {
        const ok = await changeStock(session, orderId, ctx.variant._id, -priced.quantity, 'SALE');
        if (!ok) {
          throw new AppError('INSUFFICIENT_STOCK', 409, `${ctx.product.name} không đủ hàng`, {
            variantId: priced.variantId,
            preview,
          });
        }
      }

      if (voucher?.view.valid) await consumeVoucher(session, voucher, userId, orderId, now);

      const orderCode = await nextOrderCode(now, session);
      const [created] = await OrderModel.create(
        [
          {
            _id: orderId,
            orderCode,
            userId,
            idempotencyKey,
            voucherId: voucher?.view.valid ? voucher.voucher?._id : null,
            shippingAddress: address,
            ...summary,
            status,
            note: body.note,
            items: lines.map(({ ctx, priced }) => {
              const { variant } = lineDisplay(ctx);
              return {
                variantId: ctx.variant._id,
                snapshot: {
                  name: ctx.product.name,
                  sku: variant.sku,
                  color: variant.color ?? undefined,
                  material: variant.material ?? undefined,
                  dimensions: variant.dimensions ?? undefined,
                },
                quantity: priced.quantity,
                unitPrice: priced.pricing.unitPrice,
                promotionId: priced.pricing.promotionId,
                promotionDiscount: priced.pricing.promotionDiscount,
                voucherDiscountShare: priced.voucherDiscountShare,
                finalAmount: priced.finalAmount,
                shippingTier: priced.shippingTier,
                shippingFee: priced.shippingFee,
                hasInstallation: priced.hasInstallation,
                installationFee: priced.installationFee,
                warrantyMonths: ctx.product.warrantyMonths,
              };
            }),
            statusHistory: [{ changedBy: userId, toStatus: status, changedAt: now }],
            payment: {
              method: pay.method,
              collectionType: pay.collectionType,
              status: isQr ? 'PENDING' : 'UNPAID',
              depositAmount: pay.depositAmount || undefined,
              codAmount: pay.codAmount,
              ...(isQr
                ? {
                    dueAt: new Date(now.getTime() + config.payment.qrExpireMinutes * 60_000),
                    transferContent: transferContentFor(orderCode),
                  }
                : {}),
            },
            source: body.source,
            invoiceInfo: body.invoiceInfo,
          },
        ],
        { session },
      );

      const estimated = toDate(delivery.estimatedDeliveryDate);
      const scheduled = schedule ? toDate(schedule.scheduledDate) : null;
      await ShipmentModel.create(
        [
          {
            orderId,
            estimatedDeliveryDate: estimated,
            scheduledDate: scheduled,
            scheduledSlot: schedule?.scheduledSlot ?? null,
            installationSchedule: hasInstallation ? (scheduled ?? estimated) : null,
          },
        ],
        { session },
      );

      if (body.source === 'CART') {
        await CartModel.updateOne(
          { userId },
          {
            $pull: { items: { variantId: { $in: lines.map((l) => l.ctx.variant._id) } } },
            // Voucher đã dùng cho đơn này; hủy đơn sẽ hoàn lượt, khách tự áp lại nếu muốn.
            ...(voucher?.view.valid ? { $set: { appliedVoucherId: null } } : {}),
          },
          { session },
        );
      }
      return created!;
    });
  } catch (err) {
    // Hai request cùng key chạy song song: request thua trả lại đơn của request thắng.
    if (isDuplicateKey(err, 'idempotencyKey')) {
      const raced = await replay();
      if (raced) return raced;
    }
    throw err;
  }
  // PA-08: báo Product Admin nếu đơn làm biến thể xuống dưới ngưỡng.
  notifyStockLevelsInBackground(lines.map((l) => l.ctx.variant._id));

  if (body.newAddress?.saveAddress) {
    const { saveAddress: _save, ...newAddress } = body.newAddress;
    // Đơn đã tạo xong; lưu sổ địa chỉ lỗi thì chỉ ghi log, không báo lỗi đặt hàng.
    await createAddress(userId, { ...newAddress, isDefault: false }).catch((err: unknown) =>
      console.warn('Không lưu được địa chỉ mới vào sổ:', err),
    );
  }
  return { created: true, view: toPaymentView(order, config.bankAccount, now) };
}

/** BR-C10: đơn từ giỏ bị hủy khi chờ thanh toán thì trả các dòng lại vào giỏ, trùng thì cộng dồn. */
async function returnToCart(order: OrderDoc, session: ClientSession): Promise<void> {
  const cart = await CartModel.findOneAndUpdate(
    { userId: order.userId },
    { $setOnInsert: { userId: order.userId, items: [] } },
    { upsert: true, new: true, session },
  ).orFail();
  for (const item of order.items) {
    const priceAtAdd = item.unitPrice - item.promotionDiscount / item.quantity;
    const existing = cart.items.find((i) => i.variantId.equals(item.variantId));
    if (existing) {
      existing.quantity += item.quantity;
      existing.set('isSelected', true);
    } else {
      cart.items.push({
        variantId: item.variantId,
        quantity: item.quantity,
        isSelected: true,
        priceAtAdd,
        hasInstallation: item.hasInstallation,
      });
    }
  }
  await cart.save({ session });
}

interface CancelActor {
  cancelledBy: 'CUSTOMER' | 'SYSTEM' | 'ADMIN';
  userId: Types.ObjectId | null;
  reason: string;
}

/**
 * Hủy đơn đang ở một trong `from` (API Design 8.4, 8.5): trả tồn kho, tạo yêu cầu hoàn tiền nếu đã
 * trả, trả dòng vào giỏ nếu đơn từ giỏ đang chờ thanh toán. Trả `null` nếu đơn đã đổi trạng thái
 * (ví dụ webhook vừa ghi nhận tiền).
 */
async function cancelOrder(
  orderId: Types.ObjectId,
  from: OrderStatus[],
  actor: CancelActor,
  now = new Date(),
): Promise<OrderDoc | null> {
  return mongoose.connection.transaction(async (session) => {
    const before = await OrderModel.findOneAndUpdate(
      { _id: orderId, status: { $in: from } },
      {
        $set: {
          status: 'CANCELLED',
          cancellation: {
            reason: actor.reason,
            cancelledBy: actor.cancelledBy,
            cancelledByUserId: actor.userId,
            cancelledAt: now,
          },
        },
      },
      { session },
    );
    if (!before) return null;

    for (const item of before.items) {
      await changeStock(session, before._id, item.variantId, item.quantity, 'ORDER_CANCEL_RESTORE');
    }
    // Hủy hoặc hết hạn thanh toán thì hoàn lượt voucher và trả voucher về ví (FR-37).
    if (before.voucherId) await refundVoucherUsage(session, before._id, now);
    if (isPaid(before)) {
      // Hoàn 100% (kể cả cọc, phí lắp đặt vì chưa lắp) về tài khoản đã chuyển tiền, theo quy định
      // của ngân hàng (3–7 ngày làm việc); Order Admin xử lý ở màn Thanh toán & đối soát.
      await requestRefund({
        order: before,
        amount: paidAmountOf(before),
        source: RefundSource.ORDER_CANCEL,
        note: actor.reason,
        session,
      });
    }
    if (before.source === 'CART' && before.status === 'PENDING_PAYMENT') {
      await returnToCart(before, session);
    }
    return OrderModel.findByIdAndUpdate(
      before._id,
      {
        $push: {
          statusHistory: {
            changedBy: actor.userId,
            fromStatus: before.status,
            toStatus: 'CANCELLED',
            note: actor.reason,
            changedAt: now,
          },
        },
      },
      { new: true, session },
    ).orFail();
  });
}

const PAYMENT_EXPIRED_REASON = 'Quá hạn thanh toán';

async function findOwnOrder(userId: Types.ObjectId, orderId: Types.ObjectId) {
  const order = await OrderModel.findOne({ _id: orderId, userId });
  if (!order) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  return order;
}

/** FR-38, API Design 8.4. Đơn quá hạn mà job chưa kịp quét thì hủy luôn ở đây. */
export async function getOrderPayment(
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
  now = new Date(),
): Promise<OrderPaymentView> {
  let order: OrderDoc = await findOwnOrder(userId, orderId);
  if (order.status === 'PENDING_PAYMENT' && order.payment.dueAt && order.payment.dueAt <= now) {
    const cancelled = await cancelOrder(
      order._id,
      ['PENDING_PAYMENT'],
      { cancelledBy: 'SYSTEM', userId: null, reason: PAYMENT_EXPIRED_REASON },
      now,
    );
    order = cancelled ?? (await findOwnOrder(userId, orderId));
  }
  const { bankAccount } = await getCheckoutConfig();
  return toPaymentView(order, bankAccount, now);
}

/** FR-37, API Design 8.5. */
export async function cancelByCustomer(
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
  body: { reason: string; reasonNote?: string },
): Promise<OrderPaymentView> {
  const order = await findOwnOrder(userId, orderId);
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Đơn hàng không thể hủy ở trạng thái hiện tại');
  }
  const reason = body.reasonNote ? `${body.reason}: ${body.reasonNote}` : body.reason;
  const cancelled = await cancelOrder(order._id, CUSTOMER_CANCELLABLE, {
    cancelledBy: 'CUSTOMER',
    userId,
    reason,
  });
  if (!cancelled) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Đơn hàng vừa thay đổi trạng thái');
  }
  const { bankAccount } = await getCheckoutConfig();
  return toPaymentView(cancelled, bankAccount);
}

/** OA-06: Admin hủy đơn chưa bàn giao, bắt buộc lý do; trả kho và tạo hoàn tiền nếu đã thu. */
export async function cancelByAdmin(
  orderId: Types.ObjectId,
  adminId: Types.ObjectId,
  reason: string,
): Promise<OrderDoc> {
  const cancelled = await cancelOrder(orderId, ADMIN_CANCELLABLE, {
    cancelledBy: 'ADMIN',
    userId: adminId,
    reason,
  });
  if (!cancelled) {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Đơn hàng không thể hủy ở trạng thái hiện tại');
  }
  return cancelled;
}

const ADMIN_CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'];

/** Job mỗi phút (API Design 14): hủy đơn QR quá hạn. Trả số đơn đã hủy. */
export async function expireOverduePayments(now = new Date()): Promise<number> {
  const overdue = await OrderModel.find({
    status: 'PENDING_PAYMENT',
    'payment.dueAt': { $lte: now },
  })
    .select('_id')
    .limit(100)
    .lean();
  let count = 0;
  for (const { _id } of overdue) {
    const cancelled = await cancelOrder(
      _id,
      ['PENDING_PAYMENT'],
      { cancelledBy: 'SYSTEM', userId: null, reason: PAYMENT_EXPIRED_REASON },
      now,
    );
    if (cancelled) count++;
  }
  return count;
}

/** FR-36, API Design 8.6. Đổi lịch hẹn giao sau khi đặt. */
export async function rescheduleDelivery(
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
  body: { scheduledDate: DateOnly; scheduledSlot: DeliverySlot },
  now = new Date(),
) {
  const order = await findOwnOrder(userId, orderId);
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw new AppError(
      'ORDER_INVALID_STATE',
      409,
      'Đơn đã bàn giao vận chuyển, không đổi lịch được',
    );
  }
  const { shipping } = await getCheckoutConfig();
  if (
    !isSchedulable(
      order.items.map((i) => i.shippingTier),
      shipping,
    )
  ) {
    throw new AppError('SCHEDULE_INVALID', 409, 'Đơn này không hỗ trợ hẹn lịch giao');
  }
  const shipment = await ShipmentModel.findOne({ orderId }).orFail();
  const estimatedDeliveryDate = shipment.estimatedDeliveryDate;
  if (!estimatedDeliveryDate) {
    throw new AppError('SCHEDULE_INVALID', 409, 'Đơn chưa có ngày giao dự kiến');
  }
  if (shipment.rescheduleCount >= shipping.maxReschedule) {
    throw new AppError(
      'RESCHEDULE_LIMIT',
      409,
      `Chỉ được đổi lịch tối đa ${shipping.maxReschedule} lần`,
    );
  }

  // Mốc giao hiện tại: ngày hẹn (đầu khung giờ) hoặc ngày dự kiến 8h, giờ Việt Nam.
  const currentDate = fromDate(shipment.scheduledDate ?? estimatedDeliveryDate);
  const slotStart = shipping.slots.find((s) => s.code === shipment.scheduledSlot)?.from ?? '08:00';
  const deliveryAt = new Date(`${currentDate}T${slotStart}:00+07:00`);
  if (deliveryAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
    throw new AppError('RESCHEDULE_TOO_LATE', 409, 'Chỉ đổi lịch trước giờ giao ít nhất 24 giờ');
  }

  const estimated = fromDate(estimatedDeliveryDate);
  const tomorrow = addDays(vnToday(now), 1);
  const quote = {
    estimatedDeliveryDate: estimated,
    schedulable: true,
    minScheduleDate: estimated > tomorrow ? estimated : tomorrow,
    maxScheduleDate: addDays(estimated, shipping.scheduleMaxDaysAfterEstimate),
    slots: shipping.slots.map((s) => s.code),
  };
  if (!isValidSchedule(body, quote)) {
    throw new AppError('SCHEDULE_INVALID', 400, 'Ngày hẹn không hợp lệ', {
      minScheduleDate: quote.minScheduleDate,
      maxScheduleDate: quote.maxScheduleDate,
    });
  }

  const scheduledDate = toDate(body.scheduledDate);
  shipment.scheduledDate = scheduledDate;
  shipment.scheduledSlot = body.scheduledSlot;
  shipment.rescheduleCount += 1;
  if (shipment.installationSchedule) shipment.installationSchedule = scheduledDate;
  await shipment.save();
  return {
    estimatedDeliveryDate: estimated,
    scheduledDate: body.scheduledDate,
    scheduledSlot: body.scheduledSlot,
    rescheduleCount: shipment.rescheduleCount,
  };
}

/** API Design 3.1 (rút gọn): chi tiết đơn cho trang thành công; FR-10 bổ sung `items[].actions`. */
/** Trạng thái email hóa đơn cho khách: chưa yêu cầu, đang chờ gửi, đã gửi, hoặc gửi lỗi hết số lần thử. */
function invoiceEmailStatus(invoice: {
  emailPending: boolean;
  emailAttempts: number;
  emailedTo?: string | null;
}): 'NOT_REQUESTED' | 'PENDING' | 'SENT' | 'FAILED' {
  if (invoice.emailedTo) return 'SENT';
  if (!invoice.emailPending) return 'NOT_REQUESTED';
  return invoice.emailAttempts < MAX_EMAIL_ATTEMPTS ? 'PENDING' : 'FAILED';
}

export async function getOrderDetail(userId: Types.ObjectId, orderId: Types.ObjectId) {
  const order = await findOwnOrder(userId, orderId);
  const [shipment, { shipping }, actions, refunds, invoice] = await Promise.all([
    ShipmentModel.findOne({ orderId }).lean(),
    getCheckoutConfig(),
    getItemActions(order),
    findOrderRefunds([orderId]),
    InvoiceModel.findOne({ orderId }).lean(),
  ]);
  const refund = refunds.get(orderId.toString());
  const open = CUSTOMER_CANCELLABLE.includes(order.status);
  const day = (d?: Date | null): DateOnly | null => (d ? fromDate(d) : null);
  return {
    id: order._id.toString(),
    orderCode: order.orderCode,
    status: order.status,
    source: order.source,
    createdAt: order.createdAt.toISOString(),
    shippingAddress: order.shippingAddress,
    items: order.items.map((i) => ({
      id: i._id.toString(),
      variantId: i.variantId.toString(),
      snapshot: i.snapshot,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      promotionDiscount: i.promotionDiscount,
      finalAmount: i.finalAmount,
      actions: actions.get(i._id.toString()),
      hasInstallation: i.hasInstallation,
      installationFee: i.installationFee,
      shippingFee: i.shippingFee,
    })),
    subtotal: order.subtotal,
    promotionDiscount: order.promotionDiscount,
    voucherDiscount: order.voucherDiscount,
    shippingFee: order.shippingFee,
    installationFee: order.installationFee,
    exchangeCredit: order.exchangeCredit ?? 0,
    totalAmount: order.totalAmount,
    note: order.note ?? null,
    payment: {
      method: order.payment.method,
      collectionType: order.payment.collectionType,
      status: order.payment.status,
      depositAmount: order.payment.depositAmount ?? 0,
      codAmount: order.payment.codAmount ?? 0,
      dueAt: order.payment.dueAt?.toISOString() ?? null,
      paidAt: order.payment.paidAt?.toISOString() ?? null,
    },
    /** Trạng thái hoàn tiền của đơn đã hủy (chỉ khi đã thu tiền). Không lộ chứng từ nội bộ. */
    refund: refund
      ? {
          amount: refund.amount,
          status: refund.status,
          refundTo: refund.refundTo ?? null,
          requestedAt: refund.createdAt.toISOString(),
          completedAt: refund.status === 'COMPLETED' ? refund.transactionAt.toISOString() : null,
        }
      : null,
    shipment: shipment && {
      status: shipment.status,
      estimatedDeliveryDate: day(shipment.estimatedDeliveryDate),
      scheduledDate: day(shipment.scheduledDate),
      scheduledSlot: shipment.scheduledSlot ?? null,
      actualDeliveryDate: day(shipment.actualDeliveryDate),
    },
    invoiceInfo: order.invoiceInfo,
    /** Hóa đơn điện tử, phát hành khi đơn giao thành công. `null` khi chưa giao. */
    invoice: invoice
      ? {
          invoiceNumber: invoice.invoiceNumber,
          issuedAt: invoice.issuedAt.toISOString(),
          emailStatus: invoiceEmailStatus(invoice),
          emailedTo: invoice.emailedTo ?? null,
          emailSentAt: invoice.emailSentAt?.toISOString() ?? null,
        }
      : null,
    cancellation: order.cancellation?.cancelledAt ? order.cancellation : null,
    statusHistory: order.statusHistory.map((change) => ({
      fromStatus: change.fromStatus ?? null,
      toStatus: change.toStatus,
      note: change.note ?? null,
      changedAt: change.changedAt.toISOString(),
    })),
    allowedActions: {
      canCancel: open,
      canReschedule:
        open &&
        !!shipment &&
        shipment.rescheduleCount < shipping.maxReschedule &&
        isSchedulable(
          order.items.map((i) => i.shippingTier),
          shipping,
        ),
    },
  };
}
