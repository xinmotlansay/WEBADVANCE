import type { StockStatus } from './product.model';

export type InstallationService = 'NONE' | 'OPTIONAL' | 'REQUIRED';

export type CartWarning =
  'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXCEEDS_STOCK' | 'VARIANT_UNAVAILABLE';

export interface CartItem {
  id: string;
  variantId: string;
  isSelected: boolean;
  quantity: number;
  hasInstallation: boolean;
  note: string | null;
  product: { id: string; name: string; slug: string; thumbnail: string };
  variant: {
    sku: string;
    /** Giá gốc niêm yết, gạch ngang giống thẻ sản phẩm. */
    originalPrice: number;
    color: string | null;
    material: string | null;
    dimensions: string | null;
    stockStatus: StockStatus;
    installationService: InstallationService;
    unitInstallationFee: number;
  };
  /** Giá một sản phẩm sau khuyến mãi lúc thêm vào giỏ. */
  priceAtAdd: number;
  /** Giá một sản phẩm sau khuyến mãi hiện tại. */
  currentPrice: number;
  pricing: {
    unitPrice: number;
    promotionId: string | null;
    promotionDiscount: number;
    lineTotal: number;
  };
  shippingTier: number;
  shippingFee: number;
  installationFee: number;
  warnings: CartWarning[];
  /** Chỉ có khi `EXCEEDS_STOCK`. */
  available?: number;
}

/** Lý do voucher không áp dụng được (API Design 7.3). */
export type VoucherReason =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'NOT_STARTED'
  | 'PAUSED'
  | 'USAGE_LIMIT_REACHED'
  | 'PER_USER_LIMIT_REACHED'
  | 'MIN_ORDER_NOT_MET'
  | 'SCOPE_NOT_MATCHED'
  | 'CUSTOMER_GROUP_NOT_ELIGIBLE'
  | 'NOT_STACKABLE'
  | 'VOUCHER_ALREADY_APPLIED';

/** Kết quả kiểm tra voucher của `PUT /cart/voucher` và `voucher` trong preview thanh toán. */
export interface VoucherCheckResult {
  voucherId: string | null;
  code: string | null;
  name: string | null;
  valid: boolean;
  reason: VoucherReason | null;
  message: string | null;
  /** Số tiền giảm; 0 khi không hợp lệ. */
  discount: number;
}

/** Voucher đang gắn vào giỏ. Không còn hợp lệ thì vẫn giữ lại kèm lý do, giảm giá bằng 0. */
export interface AppliedVoucher {
  id: string | null;
  code: string | null;
  name: string | null;
  valid: boolean;
  reason: VoucherReason | null;
  message: string | null;
  discount: number;
}

/** Nhập mã hoặc chọn voucher từ ví; đúng một trong hai. */
export interface ApplyVoucherRequest {
  code?: string;
  userVoucherId?: string;
}

export interface PriceSummary {
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  totalAmount: number;
}

/** `GET /cart` (API Design 7.2). */
export interface Cart {
  id: string | null;
  items: CartItem[];
  appliedVoucher: AppliedVoucher | null;
  summary: PriceSummary;
}

export interface AddCartItemRequest {
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
  note?: string;
}

export interface UpdateCartItemRequest {
  quantity?: number;
  variantId?: string;
  isSelected?: boolean;
  hasInstallation?: boolean;
  note?: string;
}
