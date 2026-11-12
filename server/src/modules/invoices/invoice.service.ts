import type { Types } from 'mongoose';
import { sendInvoiceEmail } from '../../integrations/brevo.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../utils/app-error.js';
import { getCheckoutConfig } from '../config/config.service.js';
import { InvoiceModel, OrderModel, type InvoiceDoc, type OrderDoc, type OrderDocument } from '../orders/order.model.js';
import { renderInvoicePdf, type InvoicePdfData } from './invoice.pdf.js';

/** Số lần thử gửi email hóa đơn; quá số này thì bỏ, khách vẫn tải được file trong tài khoản. */
export const MAX_EMAIL_ATTEMPTS = 5;

/**
 * Phát hành hóa đơn khi đơn chuyển `DELIVERED`: một đơn một hóa đơn, gọi lại thì giữ nguyên.
 * Lưu bản chụp bên bán và thuế suất lúc phát hành; nếu khách chọn email thì đánh dấu chờ gửi.
 */
export async function issueInvoice(order: OrderDocument): Promise<string> {
  const existing = await InvoiceModel.findOne({ orderId: order._id });
  if (existing) return existing.invoiceNumber;

  const { invoice } = await getCheckoutConfig();
  const invoiceNumber = `HD-${order.orderCode.replace(/[^0-9A-Za-z]/g, '')}`;
  const info = order.invoiceInfo;
  const emailPending = info.type !== 'NONE' && info.sendEmail && !!info.email;

  await InvoiceModel.updateOne(
    { orderId: order._id },
    {
      $setOnInsert: {
        invoiceNumber,
        issuedAt: new Date(),
        totalAmount: order.totalAmount,
        seller: {
          name: invoice.sellerName,
          taxCode: invoice.sellerTaxCode,
          address: invoice.sellerAddress,
          symbol: invoice.symbol,
          vatRate: invoice.vatRate,
        },
        emailPending,
      },
    },
    { upsert: true },
  );
  return invoiceNumber;
}

function fileNameOf(invoice: InvoiceDoc): string {
  return `HoaDon-${invoice.invoiceNumber}.pdf`;
}

/** Dựng PDF từ đơn và hóa đơn đã lưu. Hóa đơn cũ chưa có bản chụp bên bán thì dùng cấu hình hiện tại. */
async function renderOrderInvoice(order: OrderDoc, invoice: InvoiceDoc): Promise<Buffer> {
  const current = (await getCheckoutConfig()).invoice;
  const seller = invoice.seller?.symbol
    ? invoice.seller
    : { name: current.sellerName, taxCode: current.sellerTaxCode, address: current.sellerAddress, symbol: current.symbol, vatRate: current.vatRate };

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    symbol: seller.symbol,
    issuedAt: invoice.issuedAt,
    orderCode: order.orderCode,
    seller: { name: seller.name, taxCode: seller.taxCode, address: seller.address },
    buyer: {
      type: order.invoiceInfo.type,
      name: order.invoiceInfo.buyerName,
      taxCode: order.invoiceInfo.taxCode,
      address: order.invoiceInfo.address,
      recipientName: order.shippingAddress.recipientName,
    },
    lines: order.items.map((item) => ({
      name: item.snapshot.name,
      details: [item.snapshot.color, item.snapshot.material, item.snapshot.dimensions].filter(Boolean).join(' · '),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    subtotal: order.subtotal,
    promotionDiscount: order.promotionDiscount,
    voucherDiscount: order.voucherDiscount,
    shippingFee: order.shippingFee,
    installationFee: order.installationFee,
    exchangeCredit: order.exchangeCredit ?? 0,
    totalAmount: invoice.totalAmount,
    vatRate: seller.vatRate,
  };
  return renderInvoicePdf(data);
}

/** `GET /orders/:id/invoice`: khách tải hóa đơn của đơn mình. 404 khi đơn chưa giao. */
export async function getCustomerInvoicePdf(
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
): Promise<{ fileName: string; pdf: Buffer }> {
  const order = await OrderModel.findOne({ _id: orderId, userId });
  if (!order) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đơn hàng');
  const invoice = await InvoiceModel.findOne({ orderId });
  if (!invoice) {
    throw new AppError('INVOICE_NOT_FOUND', 404, 'Đơn hàng chưa có hóa đơn, hóa đơn được phát hành sau khi giao thành công');
  }
  return { fileName: fileNameOf(invoice), pdf: await renderOrderInvoice(order, invoice) };
}

/**
 * Job của worker: gửi email hóa đơn cho các đơn chờ. Lỗi gửi thì tăng số lần thử và giữ lại
 * để lần quét sau thử tiếp, tới `MAX_EMAIL_ATTEMPTS` thì bỏ. Trả về số email đã gửi.
 */
export async function sendPendingInvoiceEmails(limit = 20): Promise<number> {
  const pending = await InvoiceModel.find({
    emailPending: true,
    emailAttempts: { $lt: MAX_EMAIL_ATTEMPTS },
  })
    .sort({ issuedAt: 1 })
    .limit(limit);

  let sent = 0;
  for (const invoice of pending) {
    const order = await OrderModel.findById(invoice.orderId);
    const to = order?.invoiceInfo.email;
    // Đơn không còn đòi gửi email (dữ liệu đã đổi) thì bỏ qua, không gửi.
    if (!order || !to || !order.invoiceInfo.sendEmail || order.invoiceInfo.type === 'NONE') {
      await InvoiceModel.updateOne({ _id: invoice._id }, { $set: { emailPending: false } });
      continue;
    }
    try {
      const pdf = await renderOrderInvoice(order, invoice);
      await sendInvoiceEmail({
        to,
        invoiceNumber: invoice.invoiceNumber,
        orderCode: order.orderCode,
        fileName: fileNameOf(invoice),
        pdf,
      });
      await InvoiceModel.updateOne(
        { _id: invoice._id },
        {
          $set: { emailPending: false, emailedTo: to, emailSentAt: new Date(), emailLastError: null },
          $inc: { emailAttempts: 1 },
        },
      );
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, invoiceNumber: invoice.invoiceNumber }, 'Gửi hóa đơn qua email lỗi, sẽ thử lại');
      await InvoiceModel.updateOne(
        { _id: invoice._id },
        { $set: { emailLastError: message }, $inc: { emailAttempts: 1 } },
      );
    }
  }
  return sent;
}
