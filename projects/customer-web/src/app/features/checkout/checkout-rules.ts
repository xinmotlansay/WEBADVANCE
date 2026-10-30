import type {
  BlockingIssue,
  CheckoutPreview,
  CollectionType,
  InvoiceInfo,
  PaymentMethod,
} from 'shared';

/** Ba phương án hiển thị ở mục Phương thức thanh toán (spec mục 3.3). */
export type PaymentOption = 'COD' | 'QR_FULL' | 'QR_DEPOSIT';

type PaymentQuote = CheckoutPreview['payment'];

export function isPaymentAvailable(option: PaymentOption, quote: PaymentQuote): boolean {
  switch (option) {
    case 'COD':
      return quote.methodsAvailable.includes('COD');
    case 'QR_FULL':
      return quote.methodsAvailable.includes('BANK_TRANSFER');
    case 'QR_DEPOSIT':
      return quote.depositRequired && quote.methodsAvailable.includes('BANK_TRANSFER');
  }
}

/** Dưới ngưỡng mặc định COD; trên ngưỡng mặc định đặt cọc. */
export function defaultPayment(quote: PaymentQuote): PaymentOption | null {
  const order: PaymentOption[] = quote.depositRequired
    ? ['QR_DEPOSIT', 'QR_FULL']
    : ['COD', 'QR_FULL'];
  return order.find((o) => isPaymentAvailable(o, quote)) ?? null;
}

export function toPaymentBody(option: PaymentOption): {
  method: PaymentMethod;
  collectionType: CollectionType;
} {
  if (option === 'COD') return { method: 'COD', collectionType: 'FULL' };
  return { method: 'BANK_TRANSFER', collectionType: option === 'QR_DEPOSIT' ? 'DEPOSIT' : 'FULL' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Các ngày hẹn được chọn: từ `min` đến `max`, bỏ Chủ nhật (BR-D03). */
export function scheduleDates(min: string | null, max: string | null): string[] {
  if (!min || !max) return [];
  const dates: string[] = [];
  for (let t = Date.parse(`${min}T00:00:00Z`); t <= Date.parse(`${max}T00:00:00Z`); t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10-28` → `Thứ Tư, 28/10/2026`. */
export function formatDay(date: string): string {
  const text = dateFormat.format(new Date(`${date}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface InvoiceForm {
  type: InvoiceInfo['type'];
  buyerName: string;
  taxCode: string;
  address: string;
  sendEmail: boolean;
  email: string;
}

export type InvoiceErrors = Partial<Record<keyof InvoiceForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kiểm định dạng giống server (BR-V02, BR-V03, BR-V04). */
export function invoiceErrors(form: InvoiceForm): InvoiceErrors {
  if (form.type === 'NONE') return {};
  const errors: InvoiceErrors = {};
  const company = form.type === 'COMPANY';
  const taxCode = form.taxCode.trim();
  if (!form.buyerName.trim()) {
    errors.buyerName = company ? 'Nhập tên công ty' : 'Nhập họ tên';
  }
  if (company && !/^\d{10}(-\d{3})?$/.test(taxCode)) {
    errors.taxCode = 'Mã số thuế gồm 10 số hoặc dạng 10 số-3 số';
  } else if (!company && taxCode && !/^(\d{10}|\d{12})$/.test(taxCode)) {
    errors.taxCode = 'Mã số thuế cá nhân hoặc CCCD gồm 10 hoặc 12 số';
  }
  if (!form.address.trim()) errors.address = 'Nhập địa chỉ';
  if (form.sendEmail && !EMAIL.test(form.email.trim())) errors.email = 'Email không hợp lệ';
  return errors;
}

export function toInvoiceInfo(form: InvoiceForm): InvoiceInfo {
  if (form.type === 'NONE') return { type: 'NONE' };
  const taxCode = form.taxCode.trim();
  return {
    type: form.type,
    buyerName: form.buyerName.trim(),
    ...(taxCode ? { taxCode } : {}),
    address: form.address.trim(),
    sendEmail: form.sendEmail,
    ...(form.sendEmail ? { email: form.email.trim() } : {}),
  };
}

/** Câu báo lỗi chặn đặt hàng, hiện tại đúng mục và trên nút Đặt hàng. */
export function issueMessage(issue: BlockingIssue, productName?: string): string {
  const name = productName ? `"${productName}"` : 'Sản phẩm';
  switch (issue.code) {
    case 'NO_ITEMS':
      return 'Chưa có sản phẩm để đặt hàng';
    case 'OUT_OF_STOCK':
      return `${name} đã hết hàng`;
    case 'EXCEEDS_STOCK':
      return `${name} chỉ còn ${issue.available ?? 0} sản phẩm`;
    case 'VARIANT_UNAVAILABLE':
      return `${name} đã ngừng bán`;
    case 'ADDRESS_REQUIRED':
      return 'Chọn hoặc thêm địa chỉ giao hàng';
    case 'SCHEDULE_INVALID':
      return 'Ngày hẹn giao không hợp lệ, hãy chọn lại';
  }
}
