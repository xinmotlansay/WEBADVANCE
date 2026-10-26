import { ProductModel } from '../products/product.model.js';
import { buildListItems, type ProductListItem } from '../products/product.service.js';
import { findRunningPromotions } from './promotion.service.js';

const FLASH_SALE_LIMIT = 10;

export interface FlashSale {
  promotion: { id: string; name: string; startDate: Date; endDate: Date };
  products: ProductListItem[];
}

/** Chương trình đang chạy kết thúc sớm nhất, kèm sản phẩm thuộc chương trình đó. */
export async function getFlashSale(): Promise<FlashSale | null> {
  const [promotion] = await findRunningPromotions();
  if (!promotion) return null;

  const productIds = promotion.targets.flatMap((t) => (t.productId ? [t.productId] : []));
  const categoryIds = promotion.targets.flatMap((t) => (t.categoryId ? [t.categoryId] : []));

  const products = await ProductModel.find({
    status: 'ACTIVE',
    $or: [{ _id: { $in: productIds } }, { categoryIds: { $in: categoryIds } }],
  }).lean();

  const items = await buildListItems(products);
  return {
    promotion: {
      id: promotion._id.toString(),
      name: promotion.name,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
    },
    products: items.filter((item) => item.hasPromotion).slice(0, FLASH_SALE_LIMIT),
  };
}
