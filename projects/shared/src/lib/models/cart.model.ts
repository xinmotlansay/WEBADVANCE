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
  appliedVoucher: null;
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
