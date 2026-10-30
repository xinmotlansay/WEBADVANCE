import { AppError } from '../../utils/app-error.js';
import type { PaymentConfig, ShippingConfig } from '../config/config.service.js';
import type { VariantDoc } from '../products/variant.model.js';

/** Một dòng cần tính tiền. Giá và khuyến mãi lấy từ dữ liệu hiện tại, không tin client. */
export interface PricingInput {
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
  /** `variant.salePrice`, chưa trừ khuyến mãi. */
  unitPrice: number;
  promotionId: string | null;
  /** Mức giảm khuyến mãi cho một sản phẩm (`calcPromotionDiscount`). */
  unitPromotionDiscount: number;
  shippingTier: number;
  /** Phí lắp đặt cho một sản phẩm. */
  unitInstallationFee: number;
}

export interface PricedLine {
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
  pricing: {
    unitPrice: number;
    promotionId: string | null;
    promotionDiscount: number;
    lineTotal: number;
  };
  shippingTier: number;
  shippingFee: number;
  installationFee: number;
  voucherDiscountShare: number;
  /** Tiền hàng thực trả của dòng, không gồm phí vận chuyển và lắp đặt. */
  finalAmount: number;
}

export interface PriceSummary {
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  totalAmount: number;
}

export type PaymentMethod = 'COD' | 'BANK_TRANSFER';

export interface PaymentQuote {
  methodsAvailable: PaymentMethod[];
  depositRequired: boolean;
  depositRate: number;
  depositAmount: number;
  codAmountIfDeposit: number;
}

export interface PriceResult {
  items: PricedLine[];
  summary: PriceSummary;
  payment: PaymentQuote;
}

/** `REQUIRED` luôn lắp, `NONE` không bao giờ lắp, `OPTIONAL` theo lựa chọn của khách. */
export function resolveInstallation(
  service: VariantDoc['installationService'],
  requested: boolean,
): boolean {
  if (service === 'REQUIRED') return true;
  if (service === 'NONE') return false;
  return requested;
}

/**
 * Tính tiền dùng chung cho giỏ, `POST /checkout/preview` và `POST /orders` (spec mục 1.1).
 * Voucher chưa làm nên `voucherDiscount` luôn 0; khi làm chỉ áp trên tiền hàng sau khuyến mãi.
 */
export function priceLines(
  inputs: PricingInput[],
  shipping: ShippingConfig,
  payment: PaymentConfig,
): PriceResult {
  const tierFee = new Map(shipping.tiers.map((t) => [t.tier, t.fee]));

  const items = inputs.map((line): PricedLine => {
    const fee = tierFee.get(line.shippingTier);
    if (fee === undefined) {
      throw new Error(`Biến thể ${line.variantId} không có cấp vận chuyển hợp lệ`);
    }
    const lineTotal = line.unitPrice * line.quantity;
    const promotionDiscount = line.unitPromotionDiscount * line.quantity;
    return {
      variantId: line.variantId,
      quantity: line.quantity,
      hasInstallation: line.hasInstallation,
      pricing: {
        unitPrice: line.unitPrice,
        promotionId: line.promotionId,
        promotionDiscount,
        lineTotal,
      },
      shippingTier: line.shippingTier,
      shippingFee: fee * line.quantity,
      installationFee: line.hasInstallation ? line.unitInstallationFee * line.quantity : 0,
      voucherDiscountShare: 0,
      finalAmount: lineTotal - promotionDiscount,
    };
  });

  const sum = (pick: (l: PricedLine) => number): number =>
    items.reduce((total, l) => total + pick(l), 0);
  const subtotal = sum((l) => l.pricing.lineTotal);
  const promotionDiscount = sum((l) => l.pricing.promotionDiscount);
  const shippingFee = sum((l) => l.shippingFee);
  const installationFee = sum((l) => l.installationFee);
  const voucherDiscount = 0;
  const totalAmount =
    subtotal - promotionDiscount - voucherDiscount + shippingFee + installationFee;

  return {
    items,
    summary: {
      subtotal,
      promotionDiscount,
      voucherDiscount,
      shippingFee,
      installationFee,
      totalAmount,
    },
    payment: quotePayment(totalAmount, payment),
  };
}

/** FR-39: trên ngưỡng phải trả trước qua QR (cọc hoặc toàn bộ), không được COD toàn bộ. */
export function quotePayment(totalAmount: number, payment: PaymentConfig): PaymentQuote {
  const depositRequired = totalAmount > payment.depositThreshold;
  const depositAmount = depositRequired ? Math.round(totalAmount * payment.depositRate) : 0;
  const methodsAvailable: PaymentMethod[] = [];
  if (payment.codEnabled && !depositRequired) methodsAvailable.push('COD');
  if (payment.qrEnabled) methodsAvailable.push('BANK_TRANSFER');
  return {
    methodsAvailable,
    depositRequired,
    depositRate: payment.depositRate,
    depositAmount,
    codAmountIfDeposit: depositRequired ? totalAmount - depositAmount : 0,
  };
}

export interface PaymentChoice {
  method: PaymentMethod;
  collectionType: 'FULL' | 'DEPOSIT';
}

export interface ResolvedPayment extends PaymentChoice {
  /** Số tiền khách chuyển qua QR; 0 với COD. */
  amountDue: number;
  depositAmount: number;
  /** Phần thu khi nhận hàng. */
  codAmount: number;
}

/** Kiểm lựa chọn của khách theo spec mục 3.3; sai thì ném `AppError` như API Design 8.3. */
export function resolvePayment(
  totalAmount: number,
  quote: PaymentQuote,
  choice: PaymentChoice,
): ResolvedPayment {
  if (choice.method === 'COD' && quote.depositRequired) {
    throw new AppError(
      'DEPOSIT_REQUIRED',
      409,
      'Đơn trên ngưỡng phải đặt cọc hoặc trả trước qua QR',
    );
  }
  if (!quote.methodsAvailable.includes(choice.method)) {
    throw new AppError('PAYMENT_METHOD_DISABLED', 409, 'Phương thức thanh toán đang tạm khóa');
  }
  if (choice.method === 'COD') {
    return {
      method: 'COD',
      collectionType: 'FULL',
      amountDue: 0,
      depositAmount: 0,
      codAmount: totalAmount,
    };
  }
  if (choice.collectionType === 'DEPOSIT') {
    if (!quote.depositRequired) {
      throw new AppError('VALIDATION_ERROR', 400, 'Chỉ đặt cọc với đơn trên ngưỡng');
    }
    return {
      method: 'BANK_TRANSFER',
      collectionType: 'DEPOSIT',
      amountDue: quote.depositAmount,
      depositAmount: quote.depositAmount,
      codAmount: quote.codAmountIfDeposit,
    };
  }
  return {
    method: 'BANK_TRANSFER',
    collectionType: 'FULL',
    amountDue: totalAmount,
    depositAmount: 0,
    codAmount: 0,
  };
}
