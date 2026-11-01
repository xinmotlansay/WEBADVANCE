import { Types } from 'mongoose';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import { ProductModel } from '../products/product.model.js';
import { getCheckoutConfig } from '../config/config.service.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Cấp vận chuyển theo kích thước tổng thể, cân nặng và số kiện (requirements Phần A mục 1.2).
 * Cùng công thức với gợi ý ở form sản phẩm (`suggestTier` của admin-web).
 */
export function suggestTier(variant: Pick<VariantDoc, 'dimensions' | 'weight' | 'packages'>): number | null {
  const sides = [variant.dimensions?.length, variant.dimensions?.width, variant.dimensions?.height].map(Number);
  if (sides.some((s) => !(s > 0))) return null;
  const longest = Math.max(...sides);
  const weight = Number(variant.weight) || 0;
  if (longest > 200 || weight > 80) return 4;
  if (longest > 120 || weight > 30 || (variant.packages?.length ?? 0) > 1) return 3;
  if (longest > 60 || weight > 10) return 2;
  return 1;
}

export interface ShippingQuery {
  tier?: number;
  mismatch?: boolean;
  q?: string;
  page: number;
  limit: number;
}

/** Quy tắc cấp vận chuyển (ma trận mục 5): phí theo cấp, số biến thể mỗi cấp, biến thể lệch gợi ý. */
export async function shippingOverview(query: ShippingQuery) {
  const [config, variants] = await Promise.all([
    getCheckoutConfig(),
    VariantModel.find({ status: 'ACTIVE' })
      .select('productId sku color material dimensions weight packages shippingTier installationService installationFee')
      .sort({ sku: 1 })
      .lean<VariantDoc[]>(),
  ]);
  const products = await ProductModel.find({
    _id: { $in: [...new Set(variants.map((v) => String(v.productId)))] },
    status: { $ne: 'DISCONTINUED' },
  })
    .select('name status')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const all = variants
    .filter((v) => productById.has(String(v.productId)))
    .map((v) => {
      const suggested = suggestTier(v);
      const product = productById.get(String(v.productId))!;
      return {
        variantId: String(v._id),
        productId: String(v.productId),
        productName: product.name,
        productStatus: product.status,
        sku: v.sku,
        color: v.color ?? '',
        dimensions: {
          length: v.dimensions?.length ?? null,
          width: v.dimensions?.width ?? null,
          height: v.dimensions?.height ?? null,
        },
        weight: v.weight ?? null,
        packageCount: v.packages?.length ?? 0,
        shippingTier: v.shippingTier ?? null,
        suggestedTier: suggested,
        mismatch: suggested !== null && suggested !== (v.shippingTier ?? null),
        installationService: v.installationService ?? 'NONE',
      };
    });

  const pattern = query.q ? query.q.trim().toLowerCase() : '';
  const filtered = all.filter(
    (row) =>
      (!query.tier || row.shippingTier === query.tier) &&
      (!query.mismatch || row.mismatch || row.shippingTier === null) &&
      (!pattern || row.productName.toLowerCase().includes(pattern) || row.sku.includes(pattern) || row.sku.replace(/\./g, '').includes(pattern)),
  );
  const fees = new Map(config.shipping.tiers.map((t) => [t.tier, t.fee]));
  return {
    tiers: [1, 2, 3, 4].map((tier) => ({
      tier,
      fee: fees.get(tier) ?? 0,
      variantCount: all.filter((row) => row.shippingTier === tier).length,
      leadDays: config.shipping.leadDays[String(tier)] ?? null,
      deliveredBy: tier >= 3 ? 'FLEET' : 'PARTNER',
    })),
    mismatchCount: all.filter((row) => row.mismatch || row.shippingTier === null).length,
    data: filtered.slice((query.page - 1) * query.limit, query.page * query.limit),
    meta: {
      page: query.page,
      limit: query.limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / query.limit)),
    },
  };
}

/** Gán cấp vận chuyển cho biến thể; hạ xuống cấp 1–2 thì bỏ dịch vụ lắp đặt (requirements 1.2). */
export async function setShippingTier(variantId: Types.ObjectId, tier: number) {
  const variant = await VariantModel.findById(variantId);
  if (!variant) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy biến thể');
  const before = variant.shippingTier ?? null;
  variant.shippingTier = tier;
  const droppedInstallation = tier < 3 && variant.installationService !== 'NONE';
  if (droppedInstallation) {
    variant.installationService = 'NONE';
    variant.installationFee = 0;
  }
  await variant.save();
  return { variantId: String(variant._id), sku: variant.sku, before, after: tier, droppedInstallation };
}

/** Áp dụng cấp gợi ý cho nhiều biến thể; biến thể thiếu kích thước thì bỏ qua. */
export async function applySuggestedTiers(variantIds: Types.ObjectId[]) {
  const variants = await VariantModel.find({ _id: { $in: variantIds } })
    .select('dimensions weight packages')
    .lean<VariantDoc[]>();
  const results: Awaited<ReturnType<typeof setShippingTier>>[] = [];
  const skipped: string[] = [];
  for (const v of variants) {
    const tier = suggestTier(v);
    if (tier === null) {
      skipped.push(String(v._id));
      continue;
    }
    results.push(await setShippingTier(v._id, tier));
  }
  return { results, skipped };
}
