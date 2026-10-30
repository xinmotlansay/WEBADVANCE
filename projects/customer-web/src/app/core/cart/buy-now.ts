/** Đơn tạm của Mua nhanh (FR-32), không đụng giỏ hàng. Lưu sessionStorage để F5 không mất. */
export interface BuyNowItem {
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
}

const KEY = 'caraveso.buyNow';

export function saveBuyNow(items: BuyNowItem[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Trình duyệt chặn lưu trữ thì trang thanh toán báo mất đơn tạm và đưa khách về.
  }
}

export function readBuyNow(): BuyNowItem[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BuyNowItem[]) : [];
  } catch {
    return [];
  }
}

export function clearBuyNow(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Bỏ qua.
  }
}
