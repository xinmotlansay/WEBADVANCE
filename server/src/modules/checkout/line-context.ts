import type { Types } from 'mongoose';
import { ProductModel, type ProductDoc } from '../products/product.model.js';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import {
  buildPromotionIndex,
  calcPromotionDiscount,
  findRunningPromotions,
  resolvePromotion,
} from '../promotions/promotion.service.js';

/** Biến thể kèm sản phẩm và khuyến mãi đang chạy, đầu vào chung cho giỏ và thanh toán. */
export interface LineContext {
  variant: VariantDoc;
  product: ProductDoc;
  promotionId: string | null;
  unitPromotionDiscount: number;
  /** Giá khách trả cho một sản phẩm sau khuyến mãi; so với `priceAtAdd` để báo đổi giá. */
  finalPrice: number;
  /** Ngừng bán, sản phẩm không còn `ACTIVE` hoặc thiếu cấp vận chuyển. */
  unavailable: boolean;
}

export async function loadLineContexts(
  variantIds: Types.ObjectId[],
  now = new Date(),
): Promise<Map<string, LineContext>> {
  const variants = await VariantModel.find({ _id: { $in: variantIds } }).lean<VariantDoc[]>();
  const [products, promotions] = await Promise.all([
    ProductModel.find({ _id: { $in: variants.map((v) => v.productId) } }).lean<ProductDoc[]>(),
    findRunningPromotions(now),
  ]);
  const productById = new Map(products.map((p) => [p._id.toString(), p]));
  const index = buildPromotionIndex(promotions);

  const result = new Map<string, LineContext>();
  for (const variant of variants) {
    const product = productById.get(variant.productId.toString());
    if (!product) continue;
    const applied = resolvePromotion(product._id, product.categoryIds, index);
    const unitPromotionDiscount = applied ? calcPromotionDiscount(variant.salePrice, applied) : 0;
    result.set(variant._id.toString(), {
      variant,
      product,
      promotionId: unitPromotionDiscount > 0 && applied ? applied.promotion._id.toString() : null,
      unitPromotionDiscount,
      finalPrice: variant.salePrice - unitPromotionDiscount,
      unavailable:
        variant.status !== 'ACTIVE' || product.status !== 'ACTIVE' || !variant.shippingTier,
    });
  }
  return result;
}
