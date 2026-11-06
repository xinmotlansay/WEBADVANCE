import type { Types } from 'mongoose';
import { PromotionModel, type PromotionDoc, type PromotionTarget } from './promotion.model.js';

export interface AppliedPromotion {
  promotion: PromotionDoc;
  target: PromotionTarget;
}

export interface PromotionIndex {
  byProduct: Map<string, AppliedPromotion>;
  byCategory: Map<string, AppliedPromotion>;
}

export async function findRunningPromotions(now = new Date()): Promise<PromotionDoc[]> {
  return PromotionModel.find({
    status: 'RUNNING',
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ endDate: 1 })
    .lean();
}

export function buildPromotionIndex(promotions: PromotionDoc[]): PromotionIndex {
  const index: PromotionIndex = { byProduct: new Map(), byCategory: new Map() };
  for (const promotion of promotions) {
    for (const target of promotion.targets) {
      if (target.productId) {
        index.byProduct.set(target.productId.toString(), { promotion, target });
      } else if (target.categoryId) {
        index.byCategory.set(target.categoryId.toString(), { promotion, target });
      }
    }
  }
  return index;
}

/** Khuyến mãi theo sản phẩm được ưu tiên hơn khuyến mãi theo danh mục. */
export function resolvePromotion(
  productId: Types.ObjectId,
  categoryIds: Types.ObjectId[],
  index: PromotionIndex,
): AppliedPromotion | null {
  const direct = index.byProduct.get(productId.toString());
  if (direct) return direct;
  for (const categoryId of categoryIds) {
    const byCategory = index.byCategory.get(categoryId.toString());
    // Sản phẩm bị loại trừ khỏi chương trình danh mục (FR-004).
    const excluded = byCategory?.promotion.excludedProductIds?.some((id) => id.equals(productId));
    if (byCategory && !excluded) return byCategory;
  }
  return null;
}

export interface DiscountRule {
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue?: number | null;
}

/**
 * Mức giảm trên giá bán (BR-PROMO-04): giá sau giảm làm tròn xuống hàng nghìn và không thấp hơn
 * 1.000đ. Dùng chung cho giá khách thấy, checkout và bảng xem trước của Marketing Admin.
 */
export function discountFor(salePrice: number, rule: DiscountRule): number {
  if (salePrice <= 1000) return 0;
  const raw =
    rule.discountType === 'PERCENT' ? (salePrice * rule.discountValue) / 100 : rule.discountValue;
  const capped =
    typeof rule.maxDiscountValue === 'number' ? Math.min(raw, rule.maxDiscountValue) : raw;
  const final = Math.max(1000, Math.floor((salePrice - Math.max(0, capped)) / 1000) * 1000);
  return Math.max(0, Math.min(salePrice - final, salePrice));
}

export function calcPromotionDiscount(salePrice: number, applied: AppliedPromotion): number {
  const { promotion, target } = applied;
  return discountFor(salePrice, {
    discountType: promotion.discountType,
    discountValue: target.specificDiscountValue ?? promotion.discountValue,
    maxDiscountValue: promotion.maxDiscountValue,
  });
}
