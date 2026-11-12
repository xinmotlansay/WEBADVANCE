import PDFDocument from 'pdfkit';

// Font có đủ dấu tiếng Việt. pdfkit chỉ nhúng được TTF/OTF, nên dùng DejaVu Sans đi kèm package.
const FONT_REGULAR = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

export interface InvoicePdfLine {
  name: string;
  details: string;
  quantity: number;
  /** Đơn giá đã gồm VAT. */
  unitPrice: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  symbol: string;
  issuedAt: Date;
  orderCode: string;
  seller: { name: string; taxCode: string; address: string };
  buyer: {
    type: 'NONE' | 'PERSONAL' | 'COMPANY';
    /** Họ tên hoặc tên công ty; bỏ trống khi không lấy hóa đơn. */
    name?: string;
    taxCode?: string;
    address?: string;
    recipientName: string;
  };
  lines: InvoicePdfLine[];
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  exchangeCredit: number;
  /** Tổng thanh toán, đã gồm VAT. */
  totalAmount: number;
  vatRate: number;
}

/**
 * Tách VAT từ giá đã gồm thuế (BR-V07): tiền chưa thuế = tổng / (1 + thuế suất).
 * Tiền thuế lấy phần còn lại để cộng lại đúng tổng thanh toán.
 */
export function splitVat(total: number, vatRate: number): { net: number; vat: number } {
  const net = Math.round(total / (1 + vatRate));
  return { net, vat: total - net };
}

const money = (value: number): string => `${Math.round(value).toLocaleString('vi-VN')} VNĐ`;
const signedMoney = (value: number): string => (value > 0 ? `-${money(value)}` : money(0));
const dateText = (d: Date): string =>
  d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });

const PAGE_MARGIN = 40;
const RIGHT = 555;
const BOTTOM = 790;

/** Dựng hóa đơn A4 thành buffer PDF. */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('regular', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);

    const text = (value: string, x: number, y: number, width: number, opts: { align?: 'left' | 'right' | 'center'; size?: number; bold?: boolean } = {}) => {
      doc.font(opts.bold ? 'bold' : 'regular').fontSize(opts.size ?? 10);
      doc.text(value, x, y, { width, align: opts.align ?? 'left' });
      return doc.y;
    };

    // Đầu trang: bên bán bên trái, thông tin hóa đơn bên phải.
    text(data.seller.name, PAGE_MARGIN, 40, 300, { bold: true, size: 13 });
    let y = text(`Mã số thuế: ${data.seller.taxCode || '—'}`, PAGE_MARGIN, doc.y + 2, 300);
    y = text(`Địa chỉ: ${data.seller.address || '—'}`, PAGE_MARGIN, y + 2, 300);
    text('HÓA ĐƠN ĐIỆN TỬ', 330, 40, RIGHT - 330, { align: 'right', bold: true, size: 15 });
    text(`Ký hiệu: ${data.symbol}`, 330, 62, RIGHT - 330, { align: 'right' });
    text(`Số: ${data.invoiceNumber}`, 330, 76, RIGHT - 330, { align: 'right' });
    text(`Ngày lập: ${dateText(data.issuedAt)}`, 330, 90, RIGHT - 330, { align: 'right' });

    // Người mua.
    y = Math.max(y, 110) + 22;
    doc.moveTo(PAGE_MARGIN, y).lineTo(RIGHT, y).strokeColor('#cccccc').stroke();
    y += 10;
    text(`Mã đơn hàng: ${data.orderCode}`, PAGE_MARGIN, y, RIGHT - PAGE_MARGIN);
    y = doc.y + 4;
    if (data.buyer.type === 'NONE') {
      y = text('Người mua không lấy hóa đơn', PAGE_MARGIN, y, RIGHT - PAGE_MARGIN);
      y = text(`Người nhận hàng: ${data.buyer.recipientName}`, PAGE_MARGIN, y + 2, RIGHT - PAGE_MARGIN);
    } else {
      const label = data.buyer.type === 'COMPANY' ? 'Tên đơn vị' : 'Họ tên người mua';
      y = text(`${label}: ${data.buyer.name ?? ''}`, PAGE_MARGIN, y, RIGHT - PAGE_MARGIN);
      y = text(`Mã số thuế: ${data.buyer.taxCode || '—'}`, PAGE_MARGIN, y + 2, RIGHT - PAGE_MARGIN);
      y = text(`Địa chỉ: ${data.buyer.address ?? ''}`, PAGE_MARGIN, y + 2, RIGHT - PAGE_MARGIN);
    }

    // Bảng hàng hóa. Cột: STT | Tên hàng | SL | Đơn giá | Thành tiền.
    const cols = { stt: 40, name: 72, qty: 330, unit: 370, amount: 455 };
    const header = (top: number) => {
      doc.rect(PAGE_MARGIN, top, RIGHT - PAGE_MARGIN, 20).fill('#f0f3f7');
      doc.fillColor('#000000');
      text('STT', cols.stt, top + 6, 28, { bold: true, size: 9 });
      text('Tên hàng hóa, dịch vụ', cols.name, top + 6, 250, { bold: true, size: 9 });
      text('SL', cols.qty, top + 6, 36, { bold: true, size: 9, align: 'right' });
      text('Đơn giá', cols.unit, top + 6, 78, { bold: true, size: 9, align: 'right' });
      text('Thành tiền', cols.amount, top + 6, RIGHT - cols.amount, { bold: true, size: 9, align: 'right' });
      return top + 24;
    };

    y += 18;
    y = header(y);
    data.lines.forEach((line, i) => {
      const nameHeight = doc.font('regular').fontSize(10).heightOfString(line.name, { width: 250 });
      const detailHeight = line.details ? doc.fontSize(8.5).heightOfString(line.details, { width: 250 }) : 0;
      const rowHeight = nameHeight + detailHeight + 10;
      if (y + rowHeight > BOTTOM) {
        doc.addPage();
        y = header(PAGE_MARGIN);
      }
      text(String(i + 1), cols.stt, y, 28, { size: 9 });
      let nameY = text(line.name, cols.name, y, 250);
      if (line.details) nameY = text(line.details, cols.name, nameY, 250, { size: 8.5 });
      text(String(line.quantity), cols.qty, y, 36, { align: 'right' });
      text(money(line.unitPrice), cols.unit, y, 78, { align: 'right' });
      text(money(line.unitPrice * line.quantity), cols.amount, y, RIGHT - cols.amount, { align: 'right' });
      y = Math.max(nameY, y + 14) + 6;
      doc.moveTo(PAGE_MARGIN, y - 3).lineTo(RIGHT, y - 3).strokeColor('#e3e7ec').stroke();
    });

    // Tổng hợp: các khoản cộng trừ, rồi tách VAT.
    if (y + 170 > BOTTOM) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    y += 10;
    const summary = (label: string, value: string, opts: { bold?: boolean } = {}) => {
      text(label, 260, y, 180, { bold: opts.bold, size: 10 });
      text(value, 440, y, RIGHT - 440, { align: 'right', bold: opts.bold, size: 10 });
      y += 16;
    };
    summary('Tổng tiền hàng', money(data.subtotal));
    if (data.promotionDiscount) summary('Giảm giá khuyến mãi', signedMoney(data.promotionDiscount));
    if (data.voucherDiscount) summary('Giảm giá voucher', signedMoney(data.voucherDiscount));
    summary('Phí giao hàng', data.shippingFee ? money(data.shippingFee) : 'Miễn phí');
    if (data.installationFee) summary('Phí lắp đặt', money(data.installationFee));
    if (data.exchangeCredit) summary('Trừ giá trị hàng đổi trả', signedMoney(data.exchangeCredit));
    doc.moveTo(260, y).lineTo(RIGHT, y).strokeColor('#999999').stroke();
    y += 6;
    summary('Tổng cộng thanh toán', money(data.totalAmount), { bold: true });

    const { net, vat } = splitVat(data.totalAmount, data.vatRate);
    y += 6;
    summary('Tiền hàng chưa thuế', money(net));
    summary(`Thuế GTGT (${Math.round(data.vatRate * 100)}%)`, money(vat));

    y += 24;
    text(
      'Giá đã bao gồm thuế GTGT. Hóa đơn được hệ thống tự phát hành sau khi đơn hàng giao thành công.',
      PAGE_MARGIN,
      y,
      RIGHT - PAGE_MARGIN,
      { size: 8.5 },
    );

    doc.end();
  });
}
