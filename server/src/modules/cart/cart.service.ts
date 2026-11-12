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
import {
  evaluateVoucher,
  priceWithVoucher,
  type VoucherRow,
  type VoucherView,
} from '../vouchers/voucher.service.js';
import { VoucherModel } from '../vouchers/voucher.model.js';
import { CartModel, type CartItem } from './cart.model.js';
import type {
  AddCartItemBody,
  GuestCartLine,
  ApplyVoucherBody,
  CartSelectionBody,
  UpdateCartItemBody,
} from './cart.schema.js';

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

/** Voucher đang gắn vào giỏ. Hết hợp lệ thì vẫn giữ lại kèm lý do, giảm giá bằng 0 (BR-C08). */
export interface AppliedVoucherView {
  id: string | null;
  code: string | null;
  name: string | null;
  valid: boolean;
  reason: VoucherView['reason'];
  message: string | null;
  discount: number;
}

export interface CartView {
  id: string | null;
  items: CartItemView[];
  appliedVoucher: AppliedVoucherView | null;
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

export function formatDimensions(d: VariantDoc['dimensions']): string | null {
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
async function buildView(cart: CartDocument | null, persist = true): Promise<CartView> {
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
    // priceAtAdd = 0 chỉ có ở giỏ khách chưa đăng nhập: coi như chưa đổi giá.
    const priceAtAdd = item.priceAtAdd > 0 ? item.priceAtAdd : ctx.finalPrice;
    return [{ item, ctx, warnings: lineWarnings(ctx, item.quantity, priceAtAdd), priceAtAdd }];
  });

  let unselected = false;
  for (const row of rows) {
    if (isItemSelected(row.item) && isBlocking(row.warnings)) {
      setSelected(row.item, false);
      unselected = true;
    }
  }
  if (unselected && cart && persist) await cart.save();

  const { shipping, payment } = config;
  const priced = priceLines(
    rows.map((r) => toPricingInput(r.ctx, r.item)),
    shipping,
    payment,
  );
  const selectedRows: VoucherRow[] = rows
    .filter((r) => isItemSelected(r.item))
    .map((r) => ({ ctx: r.ctx, input: toPricingInput(r.ctx, r.item) }));
  const voucherRef = cart?.appliedVoucherId ? { voucherId: cart.appliedVoucherId } : null;
  const { priced: selectedPriced, evaluation } =
    cart && voucherRef && persist
      ? await priceWithVoucher({
          userId: cart.userId,
          ref: voucherRef,
          rows: selectedRows,
          shipping,
          payment,
        })
      : {
          priced: priceLines(
            selectedRows.map((r) => r.input),
            shipping,
            payment,
          ),
          evaluation: null,
        };

  return {
    id: cart?._id.toString() ?? null,
    items: rows.map(({ item, ctx, warnings, priceAtAdd }, i): CartItemView => {
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
        priceAtAdd,
        currentPrice: ctx.finalPrice,
        pricing: line.pricing,
        shippingTier: line.shippingTier,
        shippingFee: line.shippingFee,
        installationFee: line.installationFee,
        warnings,
        ...(warnings.includes('EXCEEDS_STOCK') ? { available: variant.stockQuantity } : {}),
      };
    }),
    appliedVoucher: evaluation && {
      id: evaluation.view.voucherId,
      code: evaluation.view.code,
      name: evaluation.view.name,
      valid: evaluation.view.valid,
      reason: evaluation.view.reason,
      message: evaluation.view.message,
      discount: evaluation.view.discount,
    },
    summary: selectedPriced.summary,
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

/**
 * FR-30, API Design 7.3: áp voucher bằng mã hoặc từ ví. Luôn trả kết quả kiểm tra; chỉ voucher hợp lệ
 * mới được gắn vào giỏ. Giỏ đã có voucher thì từ chối mã mới (`VOUCHER_ALREADY_APPLIED`) cho đến khi gỡ.
 */
export async function applyVoucher(
  userId: Types.ObjectId,
  body: ApplyVoucherBody,
): Promise<VoucherView> {
  const cart = await getOrCreateCart(userId);
  if (cart.appliedVoucherId) {
    // Mỗi đơn tối đa một voucher: muốn đổi mã phải gỡ mã cũ trước, kể cả mã cũ đã hết hợp lệ.
    const current = await VoucherModel.findById(cart.appliedVoucherId).select('code').lean();
    return {
      voucherId: null,
      code: null,
      name: null,
      valid: false,
      reason: 'VOUCHER_ALREADY_APPLIED',
      message: `Hãy gỡ mã ${current?.code ?? 'giảm giá hiện tại'} trước khi áp mã mới`,
      discount: 0,
    };
  }
  const items = cart.items.filter(isItemSelected);
  const [config, contexts] = await Promise.all([
    getCheckoutConfig(),
    loadLineContexts(items.map((i) => i.variantId)),
  ]);
  const rows = items.flatMap((item): VoucherRow[] => {
    const ctx = contexts.get(item.variantId.toString());
    if (
      !ctx?.variant.shippingTier ||
      isBlocking(lineWarnings(ctx, item.quantity, item.priceAtAdd))
    ) {
      return [];
    }
    return [{ ctx, input: toPricingInput(ctx, item) }];
  });

  const base = priceLines(
    rows.map((r) => r.input),
    config.shipping,
    config.payment,
  );
  const { view, voucher } = await evaluateVoucher(userId, body, rows, base);
  if (view.valid && voucher) {
    cart.appliedVoucherId = voucher._id;
    await cart.save();
  }
  return view;
}

export async function removeVoucher(userId: Types.ObjectId): Promise<CartView> {
  const cart = await CartModel.findOne({ userId });
  if (cart?.appliedVoucherId) {
    cart.appliedVoucherId = null;
    await cart.save();
  }
  return buildView(cart);
}

/**
 * Giỏ của khách chưa đăng nhập nằm ở trình duyệt. Server chỉ tính giá, tồn kho và cảnh báo cho các dòng
 * đó (không lưu gì, không voucher). `id` của dòng chính là `variantId` vì mỗi biến thể chỉ một dòng.
 */
export async function previewGuestCart(lines: GuestCartLine[]): Promise<CartView> {
  const cart = new CartModel({
    userId: new Types.ObjectId(),
    items: lines.map((line) => ({
      _id: new Types.ObjectId(line.variantId),
      variantId: new Types.ObjectId(line.variantId),
      quantity: line.quantity,
      isSelected: line.isSelected,
      priceAtAdd: 0,
      hasInstallation: line.hasInstallation,
      note: line.note,
    })),
  });
  const view = await buildView(cart as CartDocument, false);
  return { ...view, id: null, items: view.items.map((i) => ({ ...i, id: i.variantId })) };
}

/**
 * Sau khi đăng nhập: gộp giỏ trình duyệt vào giỏ tài khoản. Dòng ngừng bán/hết hàng bị bỏ qua, số lượng
 * vượt tồn bị cắt về phần còn lại, nên việc gộp không bao giờ làm đăng nhập thất bại.
 */
export async function mergeGuestCart(
  userId: Types.ObjectId,
  lines: GuestCartLine[],
): Promise<CartView> {
  const contexts = await loadLineContexts(lines.map((l) => new Types.ObjectId(l.variantId)));
  const cart = await getOrCreateCart(userId);
  for (const line of lines) {
    const ctx = contexts.get(line.variantId);
    if (!ctx || ctx.unavailable) continue;
    const variantId = new Types.ObjectId(line.variantId);
    const existing = cart.items.find((i) => i.variantId.equals(variantId));
    const inCart = existing?.quantity ?? 0;
    const quantity = Math.min(line.quantity, ctx.variant.stockQuantity - inCart);
    if (quantity <= 0) continue;
    const hasInstallation = resolveInstallation(
      ctx.variant.installationService,
      line.hasInstallation,
    );
    if (existing) {
      existing.quantity = inCart + quantity;
      existing.priceAtAdd = ctx.finalPrice;
      existing.hasInstallation = hasInstallation;
    } else {
      cart.items.push({
        variantId,
        quantity,
        isSelected: line.isSelected,
        priceAtAdd: ctx.finalPrice,
        hasInstallation,
        note: line.note,
      });
    }
  }
  await cart.save();
  return buildView(cart);
}
