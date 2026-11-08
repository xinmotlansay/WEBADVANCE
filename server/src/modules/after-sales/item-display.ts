import type { Types } from 'mongoose';
import { ProductModel } from '../products/product.model.js';
import { pickThumbnail } from '../products/product.service.js';
import { VariantModel } from '../products/variant.model.js';

/** Ảnh đại diện theo variantId (chuỗi) để hiển thị sản phẩm trong form bảo hành / đổi trả. */
export async function thumbnailsByVariant(variantIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const variants = await VariantModel.find({ _id: { $in: variantIds } }, { productId: 1 }).lean();
  const products = await ProductModel.find({ _id: { $in: variants.map((v) => v.productId) } }).lean();
  const byProduct = new Map(products.map((p) => [p._id.toString(), pickThumbnail(p)]));
  return new Map(variants.map((v) => [v._id.toString(), byProduct.get(v.productId.toString()) ?? '']));
}

export function variantLabel(snapshot?: { color?: string; material?: string; dimensions?: string }): string {
  return [snapshot?.dimensions, snapshot?.color, snapshot?.material].filter(Boolean).join(', ');
}
