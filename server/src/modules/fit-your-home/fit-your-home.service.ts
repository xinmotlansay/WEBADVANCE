import { AppError } from '../../utils/app-error.js';
import { CategoryModel } from '../categories/category.model.js';
import { ProductModel, type ProductDoc } from '../products/product.model.js';
import {
  buildListItems,
  priceVariants,
  type ProductListItem,
} from '../products/product.service.js';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import {
  checkFit,
  type Box,
  type FitCheckResult,
  type FitStatus,
  type Passage,
} from './fit.service.js';
import type { FitCheckBody, FitSimilarBody } from './fit-your-home.schema.js';

/** Sản phẩm tương tự: giá chênh tối đa ±20%, trả tối đa 6 sản phẩm. */
const SIMILAR_PRICE_RANGE = 0.2;
const SIMILAR_LIMIT = 6;

async function loadTarget(
  productId: string,
  variantId?: string,
): Promise<{ product: ProductDoc; variant: VariantDoc }> {
  const product = await ProductModel.findOne({ _id: productId, status: 'ACTIVE' }).lean();
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');

  const variant = await VariantModel.findOne({
    productId: product._id,
    status: 'ACTIVE',
    ...(variantId ? { _id: variantId } : {}),
  })
    .sort({ _id: 1 })
    .lean();
  if (!variant) throw new AppError('VARIANT_UNAVAILABLE', 409, 'Biến thể không còn bán');
  return { product, variant };
}

/** Bộ phận đủ ba chiều mới dùng được để kiểm tra tháo rời. */
function partBoxes(product: ProductDoc, variant: VariantDoc): Box[] {
  const names = new Map((product.parts ?? []).map((p) => [p._id.toString(), p.name]));
  return (variant.partDimensions ?? []).flatMap((d) =>
    d.length && d.width && d.height
      ? [
          {
            name: names.get(d.partId.toString()),
            length: d.length,
            width: d.width,
            height: d.height,
          },
        ]
      : [],
  );
}

function checkVariant(
  product: ProductDoc,
  variant: VariantDoc,
  passages: Passage[],
): FitCheckResult {
  return checkFit(variant.packages, partBoxes(product, variant), passages);
}

export async function checkProductFit(body: FitCheckBody): Promise<FitCheckResult> {
  const { product, variant } = await loadTarget(body.productId, body.variantId);
  if (!variant.packages?.length) {
    throw new AppError('PRODUCT_MISSING_PACKAGE_DATA', 409, 'Sản phẩm chưa có dữ liệu kiện hàng');
  }
  return checkVariant(product, variant, body.passages);
}

export type SimilarFitItem = ProductListItem & { fitStatus: FitStatus };

/**
 * Sản phẩm cùng danh mục loại sản phẩm, giá sau khuyến mãi trong ±20% giá biến thể đang xem, và
 * qua được các lối đi của khách. Sản phẩm nhiều biến thể lấy kết quả tốt nhất trong các biến thể.
 */
export async function findSimilarFit(body: FitSimilarBody): Promise<SimilarFitItem[]> {
  const { product, variant } = await loadTarget(body.productId, body.variantId);
  const basePrice = (await priceVariants(product, [variant])).get(variant._id.toString())?.final;
  if (basePrice === undefined) return [];

  const categoryIds = await CategoryModel.find({
    _id: { $in: product.categoryIds },
    type: 'PRODUCT_CATEGORY',
  }).distinct('_id');
  if (categoryIds.length === 0) return [];

  const candidates = await ProductModel.find({
    _id: { $ne: product._id },
    status: 'ACTIVE',
    categoryIds: { $in: categoryIds },
  }).lean();
  const items = (await buildListItems(candidates)).filter(
    (i) => Math.abs(i.priceFrom - basePrice) <= basePrice * SIMILAR_PRICE_RANGE,
  );

  const variants = await VariantModel.find({
    productId: { $in: items.map((i) => i.id) },
    status: 'ACTIVE',
    'packages.0': { $exists: true },
  }).lean();
  const productsById = new Map(candidates.map((p) => [p._id.toString(), p]));
  const allowed: FitStatus[] = body.includeCaution ? ['PASS', 'CAUTION'] : ['PASS'];

  const results = items.flatMap((item) => {
    const candidate = productsById.get(item.id);
    if (!candidate) return [];
    const statuses = variants
      .filter((v) => v.productId.toString() === item.id)
      .map((v) => checkVariant(candidate, v, body.passages).status);
    const fitStatus: FitStatus = statuses.includes('PASS')
      ? 'PASS'
      : statuses.includes('CAUTION')
        ? 'CAUTION'
        : 'FAIL';
    return allowed.includes(fitStatus) ? [{ ...item, fitStatus }] : [];
  });

  return results
    .sort((a, b) => Math.abs(a.priceFrom - basePrice) - Math.abs(b.priceFrom - basePrice))
    .slice(0, SIMILAR_LIMIT);
}
