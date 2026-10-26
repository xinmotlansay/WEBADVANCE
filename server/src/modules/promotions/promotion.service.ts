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
    if (byCategory) return byCategory;
  }
  return null;
}

export function calcPromotionDiscount(salePrice: number, applied: AppliedPromotion): number {
  const { promotion, target } = applied;
  const value = target.specificDiscountValue ?? promotion.discountValue;
  const raw = promotion.discountType === 'PERCENT' ? (salePrice * value) / 100 : value;
  const capped =
    promotion.maxDiscountValue !== undefined ? Math.min(raw, promotion.maxDiscountValue) : raw;
  return Math.max(0, Math.min(Math.round(capped), salePrice));
}
