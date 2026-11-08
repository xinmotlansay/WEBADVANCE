import type { Cart, CartItem } from 'shared';

/** Cảnh báo khiến dòng không được chọn để thanh toán, khớp server (BR-C01, BR-C04, BR-C05). */
const BLOCKING: CartItem['warnings'] = ['VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'EXCEEDS_STOCK'];

export function isBlocking(warnings: CartItem['warnings']): boolean {
  return warnings.some((w) => BLOCKING.includes(w));
}

/**
 * Giỏ sau khi đổi số lượng một dòng, tính ngay trên client để hóa đơn đổi theo cú bấm.
 * Mọi khoản trong `priceLines` (server/checkout/pricing.ts) đều là đơn giá × số lượng nên
 * nhân theo tỉ lệ là khớp server; response thật thay vào sau. Cảnh báo tồn kho để server tính.
 */
export function withQuantity(cart: Cart, itemId: string, quantity: number): Cart {
  const items = cart.items.map((item) => {
    if (item.id !== itemId || item.quantity === quantity) return item;
    const scale = (amount: number) => Math.round((amount / item.quantity) * quantity);
    return {
      ...item,
      quantity,
      pricing: {
        ...item.pricing,
        lineTotal: scale(item.pricing.lineTotal),
        promotionDiscount: scale(item.pricing.promotionDiscount),
      },
      shippingFee: scale(item.shippingFee),
      installationFee: scale(item.installationFee),
    };
  });
  const selected = items.filter((i) => i.isSelected);
  const sum = (pick: (i: CartItem) => number) => selected.reduce((t, i) => t + pick(i), 0);
  const subtotal = sum((i) => i.pricing.lineTotal);
  const promotionDiscount = sum((i) => i.pricing.promotionDiscount);
  const shippingFee = sum((i) => i.shippingFee);
  const installationFee = sum((i) => i.installationFee);
  const { voucherDiscount } = cart.summary;
  return {
    ...cart,
    items,
    summary: {
      subtotal,
      promotionDiscount,
      voucherDiscount,
      shippingFee,
      installationFee,
      totalAmount: subtotal - promotionDiscount - voucherDiscount + shippingFee + installationFee,
    },
  };
}
