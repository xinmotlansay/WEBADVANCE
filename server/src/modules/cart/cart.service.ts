import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { loadLineContexts, type LineContext } from '../checkout/line-context.js';
import {
  priceLines,
  resolveInstallation,
  type PriceSummary,
  type PricingInput,
} from '../checkout/pricing.js';
import { getCheckoutConfig } from '../config/config.service.js';
import {
  pickThumbnail,
  variantStockStatus,
  type StockStatus,
} from '../products/product.service.js';
import type { VariantDoc } from '../products/variant.model.js';
import { CartModel, type CartItem } from './cart.model.js';
import type { AddCartItemBody, CartSelectionBody, UpdateCartItemBody } from './cart.schema.js';

export type CartWarning =
  'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXCEEDS_STOCK' | 'VARIANT_UNAVAILABLE';

/** Cảnh báo khiến dòng không được chọn để thanh toán (BR-C01, BR-C04, BR-C05). */
const BLOCKING: CartWarning[] = ['VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'EXCEEDS_STOCK'];

export interface CartItemView {
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
    installationService: VariantDoc['installationService'];
    unitInstallationFee: number;
  };
  priceAtAdd: number;
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

export interface CartView {
  id: string | null;
  items: CartItemView[];
  appliedVoucher: null;
  summary: PriceSummary;
}

type CartDocument = Awaited<ReturnType<typeof getOrCreateCart>>;

export function lineWarnings(
  ctx: LineContext,
  quantity: number,
  priceAtAdd: number,
): CartWarning[] {
  const warnings: CartWarning[] = [];
  const stock = ctx.variant.stockQuantity;
  if (ctx.unavailable) warnings.push('VARIANT_UNAVAILABLE');
  if (stock <= 0) warnings.push('OUT_OF_STOCK');
  else if (quantity > stock) warnings.push('EXCEEDS_STOCK');
  else if (stock <= ctx.variant.lowStockThreshold) warnings.push('LOW_STOCK');
  if (priceAtAdd !== ctx.finalPrice) warnings.push('PRICE_CHANGED');
  return warnings;
}

export const isBlocking = (warnings: CartWarning[]): boolean =>
  warnings.some((w) => BLOCKING.includes(w));

/** BR-C03: số lượng trong giỏ không được vượt tồn kho hiện tại. */
function assertStock(ctx: LineContext, quantity: number, inCart: number): void {
  const available = ctx.variant.stockQuantity;
  if (quantity <= available) return;
  const message = available <= 0 ? 'Sản phẩm đã hết hàng' : `Chỉ còn ${available} sản phẩm`;
  throw new AppError('INSUFFICIENT_STOCK', 409, message, {
    available: Math.max(0, available),
    inCart,
  });
}

function assertAvailable(ctx: LineContext | undefined): asserts ctx is LineContext {
  if (!ctx || ctx.unavailable) {
    throw new AppError('VARIANT_UNAVAILABLE', 409, 'Biến thể này đã ngừng bán');
  }
}

/** Chọn dòng để thanh toán: không được ngừng bán, hết hàng hay vượt tồn. */
function assertSelectable(ctx: LineContext | undefined, quantity: number): void {
  assertAvailable(ctx);
  assertStock(ctx, quantity, quantity);
}

export function toPricingInput(
  ctx: LineContext,
  item: Pick<CartItem, 'quantity' | 'hasInstallation'>,
): PricingInput {
  return {
    variantId: ctx.variant._id.toString(),
    quantity: item.quantity,
    hasInstallation: item.hasInstallation,
    unitPrice: ctx.variant.salePrice,
    promotionId: ctx.promotionId,
    unitPromotionDiscount: ctx.unitPromotionDiscount,
    shippingTier: ctx.variant.shippingTier ?? 0,
    unitInstallationFee: ctx.variant.installationFee ?? 0,
  };
}

/**
 * Field `isSelected` (giữ đúng tên theo Database Design) trùng tên method `isSelected(path)` của
 * Mongoose Document nên TypeScript hiểu `item.isSelected` là hàm. Đọc/ghi qua `get`/`set`.
 * Mongoose bên trong chỉ dùng `$isSelected`, field ghi đè method là an toàn ở runtime.
 */
function setSelected(item: { set(path: string, value: unknown): unknown }, value: boolean): void {
  item.set('isSelected', value);
}

export function isItemSelected(item: { get(path: string): unknown }): boolean {
  return item.get('isSelected') === true;
}

function formatDimensions(d: VariantDoc['dimensions']): string | null {
  return d?.length && d.width && d.height ? `${d.length}x${d.width}x${d.height}` : null;
}

/** Thông tin hiển thị của một dòng, dùng chung cho giỏ và trang thanh toán. */
export function lineDisplay({
  product,
  variant,
}: LineContext): Pick<CartItemView, 'product' | 'variant'> {
  return {
    product: {
      id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      thumbnail: pickThumbnail(product),
    },
    variant: {
      sku: variant.sku,
      originalPrice: variant.originalPrice,
      color: variant.color ?? null,
      material: variant.material ?? null,
      dimensions: formatDimensions(variant.dimensions),
      stockStatus: variantStockStatus(variant),
      installationService: variant.installationService,
      unitInstallationFee: variant.installationFee ?? 0,
    },
  };
}

async function getOrCreateCart(userId: Types.ObjectId) {
  return CartModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { upsert: true, new: true },
  ).orFail();
}

/**
 * Dựng response `GET /cart` (API Design 7.2). Dòng vừa trở nên ngừng bán, hết hàng hoặc vượt tồn
 * thì tự bỏ chọn và lưu lại.
 */
async function buildView(cart: CartDocument | null): Promise<CartView> {
  const items = cart?.items ?? [];
  const [config, contexts] = await Promise.all([
    getCheckoutConfig(),
    loadLineContexts(items.map((i) => i.variantId)),
  ]);

  // ponytail: dòng mất dữ liệu biến thể/sản phẩm hoặc thiếu cấp vận chuyển bị ẩn khỏi giỏ;
  // dữ liệu ACTIVE luôn có cấp (PA-04) nên chỉ gặp khi dữ liệu hỏng.
  const rows = items.flatMap((item) => {
    const ctx = contexts.get(item.variantId.toString());
    if (!ctx?.variant.shippingTier) return [];
    return [{ item, ctx, warnings: lineWarnings(ctx, item.quantity, item.priceAtAdd) }];
  });

  let unselected = false;
  for (const row of rows) {
    if (isItemSelected(row.item) && isBlocking(row.warnings)) {
      setSelected(row.item, false);
      unselected = true;
    }
  }
  if (unselected && cart) await cart.save();

  const { shipping, payment } = config;
  const priced = priceLines(
    rows.map((r) => toPricingInput(r.ctx, r.item)),
    shipping,
    payment,
  );
  const selectedInputs = rows
    .filter((r) => isItemSelected(r.item))
    .map((r) => toPricingInput(r.ctx, r.item));

  return {
    id: cart?._id.toString() ?? null,
    items: rows.map(({ item, ctx, warnings }, i): CartItemView => {
      const line = priced.items[i]!;
      const { variant } = ctx;
      return {
        id: item._id.toString(),
        variantId: variant._id.toString(),
        isSelected: isItemSelected(item),
        quantity: item.quantity,
        hasInstallation: item.hasInstallation,
        note: item.note ?? null,
        ...lineDisplay(ctx),
        priceAtAdd: item.priceAtAdd,
        currentPrice: ctx.finalPrice,
        pricing: line.pricing,
        shippingTier: line.shippingTier,
        shippingFee: line.shippingFee,
        installationFee: line.installationFee,
        warnings,
        ...(warnings.includes('EXCEEDS_STOCK') ? { available: variant.stockQuantity } : {}),
      };
    }),
    appliedVoucher: null,
    summary: priceLines(selectedInputs, shipping, payment).summary,
  };
}

function findItem(cart: CartDocument | null, itemId: Types.ObjectId) {
  const item = cart?.items.id(itemId);
  if (!cart || !item) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm trong giỏ');
  return { cart, item };
}

export async function getCart(userId: Types.ObjectId): Promise<CartView> {
  return buildView(await CartModel.findOne({ userId }));
}

/** FR-28, API Design 7.1. Trùng biến thể thì cộng dồn. */
export async function addItem(userId: Types.ObjectId, body: AddCartItemBody): Promise<CartView> {
  const variantId = new Types.ObjectId(body.variantId);
  const ctx = (await loadLineContexts([variantId])).get(body.variantId);
  assertAvailable(ctx);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => i.variantId.equals(variantId));
  const inCart = existing?.quantity ?? 0;
  assertStock(ctx, inCart + body.quantity, inCart);

  const hasInstallation = resolveInstallation(
    ctx.variant.installationService,
    body.hasInstallation,
  );
  if (existing) {
    existing.quantity = inCart + body.quantity;
    existing.priceAtAdd = ctx.finalPrice;
    existing.hasInstallation = hasInstallation;
    setSelected(existing, true);
    if (body.note !== undefined) existing.note = body.note;
  } else {
    cart.items.push({
      variantId,
      quantity: body.quantity,
      isSelected: true,
      priceAtAdd: ctx.finalPrice,
      hasInstallation,
      note: body.note,
    });
  }
  await cart.save();
  return buildView(cart);
}

/** FR-29, API Design 7.1b. Gửi field nào đổi field đó; tăng số lượng không được vượt tồn. */
export async function updateItem(
  userId: Types.ObjectId,
  itemId: Types.ObjectId,
  body: UpdateCartItemBody,
): Promise<CartView> {
  const { cart, item } = findItem(await CartModel.findOne({ userId }), itemId);
  const nextVariantId = body.variantId ? new Types.ObjectId(body.variantId) : null;
  const variantChanged = !!nextVariantId && !nextVariantId.equals(item.variantId);

  const contexts = await loadLineContexts(
    variantChanged && nextVariantId ? [item.variantId, nextVariantId] : [item.variantId],
  );
  let ctx = contexts.get(item.variantId.toString());
  let target = item;

  if (variantChanged && nextVariantId) {
    const next = contexts.get(nextVariantId.toString());
    assertAvailable(next);
    if (!ctx || !next.product._id.equals(ctx.product._id)) {
      throw new AppError('VALIDATION_ERROR', 400, 'Chỉ đổi được biến thể của cùng sản phẩm');
    }
    ctx = next;
    // Biến thể mới đã có trong giỏ thì gộp vào dòng đó và xóa dòng hiện tại.
    const other = cart.items.find((i) => i.variantId.equals(nextVariantId));
    const inCart = other?.quantity ?? 0;
    const quantity = inCart + (body.quantity ?? item.quantity);
    assertStock(ctx, quantity, inCart);
    if (other) {
      setSelected(other, isItemSelected(other) || isItemSelected(item));
      item.deleteOne();
      target = other;
    } else {
      item.variantId = nextVariantId;
    }
    target.quantity = quantity;
    target.priceAtAdd = ctx.finalPrice;
    target.hasInstallation = resolveInstallation(
      ctx.variant.installationService,
      body.hasInstallation ?? item.hasInstallation,
    );
  } else if (body.quantity !== undefined && body.quantity !== item.quantity) {
    assertAvailable(ctx);
    // Giảm số lượng luôn được phép, kể cả khi đang vượt tồn (nút "Giảm về N").
    if (body.quantity > item.quantity) assertStock(ctx, body.quantity, item.quantity);
    item.quantity = body.quantity;
    item.priceAtAdd = ctx.finalPrice;
  }

  if (body.hasInstallation !== undefined && !variantChanged) {
    assertAvailable(ctx);
    target.hasInstallation = resolveInstallation(
      ctx.variant.installationService,
      body.hasInstallation,
    );
  }
  if (body.note !== undefined) target.note = body.note;
  if (body.isSelected === true) assertSelectable(ctx, target.quantity);
  if (body.isSelected !== undefined) setSelected(target, body.isSelected);

  await cart.save();
  return buildView(cart);
}

export async function removeItem(
  userId: Types.ObjectId,
  itemId: Types.ObjectId,
): Promise<CartView> {
  const { cart, item } = findItem(await CartModel.findOne({ userId }), itemId);
  item.deleteOne();
  await cart.save();
  return buildView(cart);
}

/** Chọn/bỏ chọn hàng loạt. Khi chọn, dòng ngừng bán, hết hàng, vượt tồn được bỏ qua. */
export async function setSelection(
  userId: Types.ObjectId,
  body: CartSelectionBody,
): Promise<CartView> {
  const cart = await CartModel.findOne({ userId });
  if (!cart) return buildView(null);

  const scope = body.itemIds ? new Set(body.itemIds) : null;
  const items = cart.items.filter((i) => !scope || scope.has(i._id.toString()));
  const contexts = body.isSelected ? await loadLineContexts(items.map((i) => i.variantId)) : null;

  for (const item of items) {
    const ctx = contexts?.get(item.variantId.toString());
    if (contexts && (!ctx || isBlocking(lineWarnings(ctx, item.quantity, item.priceAtAdd)))) {
      continue;
    }
    setSelected(item, body.isSelected);
  }
  await cart.save();
  return buildView(cart);
}
