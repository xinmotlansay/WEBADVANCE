import { Types, type QueryFilter } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { CategoryModel } from '../categories/category.model.js';
import { OrderModel } from '../orders/order.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import {
  PromotionModel,
  type PromotionDoc,
  type PromotionState,
} from '../promotions/promotion.model.js';
import { logAdminAction } from './admin-log.js';
import { promotionStatus, type PromotionStatus } from './effective-status.js';
import {
  STATUS_ORDER,
  checkDiscount,
  checkEdit,
  checkReason,
  checkRequired,
  checkTimes,
  checkTransition,
  conflictError,
  findConflicts,
  hasHighDiscount,
  hasRun,
  previewLine,
  promotionCode,
  type Action,
  type CreatePromotionInput,
  type Occupant,
  type PauseReason,
  type UpdatePromotionInput,
} from './promotion-admin.rules.js';

const oid = (s: string) => new Types.ObjectId(s);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const conflict409 = () =>
  new AppError('E-COM-05', 409, 'Chương trình vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy chương trình khuyến mãi');

export const listQuerySchema = z.object({
  q: z.string().trim().min(2, 'Vui lòng nhập từ 2 đến 100 ký tự để tìm kiếm.').max(100).optional(),
  type: z.enum(['PRODUCT', 'CATEGORY']).optional(),
  status: z.enum(['DRAFT', 'UPCOMING', 'RUNNING', 'PAUSED', 'ENDED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => [20, 50, 100].includes(n))
    .default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Trạng thái cũ mà code phía khách đọc (`status: 'RUNNING'` + khoảng ngày) luôn đi cùng `state`. */
const legacyStatus = (s: PromotionState): PromotionDoc['status'] =>
  s === 'ACTIVE' ? 'RUNNING' : s === 'ENDED' ? 'ENDED' : 'PAUSED';

// ---------- Mở rộng phạm vi thành danh sách sản phẩm / biến thể ----------

interface ProductLite {
  _id: Types.ObjectId;
  name: string;
  status: string;
  categoryIds: Types.ObjectId[];
}
interface Scope {
  scopeType?: 'PRODUCT' | 'CATEGORY';
  productIds: string[];
  categoryIds: string[];
  excludedProductIds: string[];
}

const scopeOf = (p: PromotionDoc): Scope => ({
  scopeType: p.scopeType ?? (p.targets.some((t) => t.categoryId) ? 'CATEGORY' : 'PRODUCT'),
  productIds: p.targets.flatMap((t) => (t.productId ? [String(t.productId)] : [])),
  categoryIds: p.targets.flatMap((t) => (t.categoryId ? [String(t.categoryId)] : [])),
  excludedProductIds: (p.excludedProductIds ?? []).map(String),
});

/** Sản phẩm thực sự thuộc chương trình (danh mục đã mở rộng, trừ loại trừ). */
function productsOf(scope: Scope, all: ProductLite[]): ProductLite[] {
  const excluded = new Set(scope.excludedProductIds);
  if (scope.scopeType === 'CATEGORY') {
    const cats = new Set(scope.categoryIds);
    return all.filter(
      (p) => !excluded.has(String(p._id)) && p.categoryIds.some((c) => cats.has(String(c))),
    );
  }
  const ids = new Set(scope.productIds);
  return all.filter((p) => ids.has(String(p._id)));
}

const loadProducts = () =>
  ProductModel.find({}, '_id name status categoryIds').lean<ProductLite[]>();

/** Chương trình khác đang chiếm sản phẩm: chỉ tính chương trình đã kích hoạt, chưa quá hạn. */
async function occupants(
  selfId: string | null,
  all: ProductLite[],
  now: Date,
): Promise<Occupant[]> {
  const filter: QueryFilter<PromotionDoc> = { state: 'ACTIVE', endDate: { $gt: now } };
  if (selfId) filter._id = { $ne: oid(selfId) };
  const others = await PromotionModel.find(filter).lean();
  return others.map((o) => ({
    id: String(o._id),
    code: o.code ?? '',
    name: o.name,
    startDate: o.startDate,
    endDate: o.endDate,
    productIds: new Set(productsOf(scopeOf(o), all).map((p) => String(p._id))),
  }));
}

// ---------- Kiểm tra đầy đủ khi kích hoạt / lưu chương trình đã kích hoạt ----------

interface Merged extends Scope {
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  discountType?: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue?: number;
  maxDiscountValue?: number | null;
}

interface Checked {
  merged: Merged;
  products: ProductLite[];
  variants: { _id: Types.ObjectId; productId: Types.ObjectId; salePrice: number }[];
}

async function validateActive(
  m: Merged,
  selfId: string | null,
  now: Date,
  opts: {
    checkStart: boolean;
    endAfterNowHour: boolean;
    excludeConflicts?: boolean;
    confirmHigh?: boolean;
  },
): Promise<Checked> {
  checkRequired({ ...m, scopeType: m.scopeType! });
  const start = m.startDate!;
  const end = m.endDate!;
  checkTimes(start, end, now, opts.checkStart);
  if (opts.endAfterNowHour && end.getTime() < now.getTime() + 3_600_000) {
    throw new AppError(
      'E-MKT-005-03',
      400,
      'Thời gian kết thúc mới phải sau thời điểm hiện tại ít nhất 1 giờ. Nếu muốn dừng ngay, hãy dùng chức năng Kết thúc sớm.',
    );
  }

  // Sản phẩm / danh mục phải đang kinh doanh / hiển thị (E-MKT-004-06).
  const all = await loadProducts();
  if (m.scopeType === 'PRODUCT') {
    const byId = new Map(all.map((p) => [String(p._id), p]));
    for (const id of m.productIds) {
      const p = byId.get(id);
      if (!p || p.status !== 'ACTIVE') {
        throw new AppError(
          'E-MKT-004-06',
          400,
          `Sản phẩm ${p?.name ?? id} không còn kinh doanh hoặc đang bị ẩn.`,
        );
      }
    }
  } else {
    const cats = await CategoryModel.find({
      _id: { $in: m.categoryIds.map(oid) },
      status: 'VISIBLE',
    }).lean();
    const bad = m.categoryIds.find((id) => !cats.some((c) => String(c._id) === id));
    if (bad)
      throw new AppError(
        'E-MKT-004-06',
        400,
        `Danh mục ${bad} không còn kinh doanh hoặc đang bị ẩn.`,
      );
  }

  // Xung đột BR-PROMO-01.
  let products = productsOf(m, all).filter((p) => p.status === 'ACTIVE');
  const found = findConflicts(
    products.map((p) => String(p._id)),
    await occupants(selfId, all, now),
    start,
    end,
  );
  if (found.size > 0) {
    if (!opts.excludeConflicts) {
      throw conflictError(found, new Map(all.map((p) => [String(p._id), p.name])));
    }
    // "Loại trừ các biến thể trùng": bỏ khỏi danh sách (sản phẩm) hoặc thêm vào loại trừ (danh mục).
    if (m.scopeType === 'PRODUCT') m.productIds = m.productIds.filter((id) => !found.has(id));
    else m.excludedProductIds = [...new Set([...m.excludedProductIds, ...found.keys()])];
    products = products.filter((p) => !found.has(String(p._id)));
  }
  if (products.length === 0) {
    throw new AppError('E-MKT-004-01', 400, 'Không còn sản phẩm nào để áp dụng chương trình.');
  }

  const variants = await VariantModel.find(
    { productId: { $in: products.map((p) => p._id) }, status: 'ACTIVE' },
    '_id productId salePrice',
  ).lean();
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.salePrice)) : null;
  const rule = {
    discountType: m.discountType!,
    discountValue: m.discountValue!,
    maxDiscountValue: m.maxDiscountValue,
  };
  checkDiscount(rule, minPrice);
  if (!opts.confirmHigh && hasHighDiscount(variants.map((v) => previewLine(v.salePrice, rule)))) {
    throw new AppError('CONFIRM_REQUIRED', 409, 'Mức giảm vượt 50% giá gốc. Bạn chắc chắn?');
  }
  return { merged: m, products, variants };
}

function targetsOf(m: Scope) {
  return m.scopeType === 'CATEGORY'
    ? m.categoryIds.map((id) => ({ categoryId: oid(id) }))
    : m.productIds.map((id) => ({ productId: oid(id) }));
}

// ---------- Phân tích dòng, cảnh báo, số liệu ----------

interface Line {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  price: number;
  promoPrice: number;
  percent: number;
  warnings: string[];
  priceChangedFrom: number | null;
}

async function analyze(
  promos: PromotionDoc[],
): Promise<Map<string, { lines: Line[]; flags: string[] }>> {
  const all = await loadProducts();
  const scoped = promos.map((p) => ({ p, products: productsOf(scopeOf(p), all) }));
  const pids = new Set(scoped.flatMap((s) => s.products.map((x) => x._id)));
  const variants = await VariantModel.find(
    { productId: { $in: [...pids] }, status: 'ACTIVE' },
    '_id productId sku salePrice stockQuantity',
  ).lean();
  const out = new Map<string, { lines: Line[]; flags: string[] }>();
  for (const { p, products } of scoped) {
    const snap = new Map((p.priceSnapshot ?? []).map((s) => [String(s.variantId), s.price]));
    const rule = {
      discountType: p.discountType,
      discountValue: p.discountValue,
      maxDiscountValue: p.maxDiscountValue,
    };
    const lines: Line[] = [];
    for (const prod of products) {
      for (const v of variants.filter((x) => String(x.productId) === String(prod._id))) {
        const pv = p.discountType ? previewLine(v.salePrice, rule) : null;
        const old = snap.get(String(v._id));
        const warnings: string[] = [];
        if (prod.status !== 'ACTIVE') warnings.push('PRODUCT_UNAVAILABLE');
        if (v.stockQuantity <= 0) warnings.push('OUT_OF_STOCK');
        if (old != null && old !== v.salePrice) warnings.push('PRICE_CHANGED');
        lines.push({
          productId: String(prod._id),
          productName: prod.name,
          variantId: String(v._id),
          sku: v.sku,
          price: v.salePrice,
          promoPrice: pv?.finalPrice ?? v.salePrice,
          percent: pv?.percent ?? 0,
          warnings,
          priceChangedFrom: warnings.includes('PRICE_CHANGED') ? old! : null,
        });
      }
      // Sản phẩm bị ẩn/ngừng kinh doanh không có biến thể ACTIVE vẫn cần cờ.
      if (prod.status !== 'ACTIVE' && !lines.some((l) => l.productId === String(prod._id))) {
        lines.push({
          productId: String(prod._id),
          productName: prod.name,
          variantId: '',
          sku: '',
          price: 0,
          promoPrice: 0,
          percent: 0,
          warnings: ['PRODUCT_UNAVAILABLE'],
          priceChangedFrom: null,
        });
      }
    }
    const flags = [
      ...(lines.some(
        (l) => l.warnings.includes('PRODUCT_UNAVAILABLE') || l.warnings.includes('OUT_OF_STOCK'),
      )
        ? ['PRODUCT_AFFECTED']
        : []),
      ...(lines.some((l) => l.warnings.includes('PRICE_CHANGED')) ? ['PRICE_CHANGED'] : []),
    ];
    out.set(String(p._id), { lines, flags });
  }
  return out;
}

async function orderStats(
  ids: Types.ObjectId[],
): Promise<Map<string, { orders: number; discount: number }>> {
  const rows = await OrderModel.aggregate<{
    _id: Types.ObjectId;
    orders: number;
    discount: number;
  }>([
    { $match: { 'items.promotionId': { $in: ids }, status: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    { $match: { 'items.promotionId': { $in: ids } } },
    {
      $group: {
        _id: '$items.promotionId',
        orderIds: { $addToSet: '$_id' },
        discount: { $sum: '$items.promotionDiscount' },
      },
    },
    { $project: { orders: { $size: '$orderIds' }, discount: 1 } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { orders: r.orders, discount: r.discount }]));
}

function toRow(p: PromotionDoc, now: Date) {
  const status = promotionStatus(p, now);
  return {
    id: String(p._id),
    code: p.code ?? '',
    name: p.name,
    scopeType: scopeOf(p).scopeType,
    discountType: p.discountType ?? null,
    discountValue: p.discountValue ?? null,
    maxDiscountValue: p.maxDiscountValue ?? null,
    scopeCount: p.targets.length,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    status,
    version: p.version ?? 0,
  };
}

export async function listPromotions(q: ListQuery, now = new Date()) {
  const filter: QueryFilter<PromotionDoc> = {};
  if (q.q) {
    const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (q.type) filter.scopeType = q.type;
  if (q.from) filter.endDate = { $gte: q.from };
  if (q.to) filter.startDate = { $lte: q.to };
  if (q.from && q.to && q.from > q.to) {
    throw new AppError('VALIDATION_ERROR', 400, 'Từ ngày phải nhỏ hơn hoặc bằng Đến ngày.');
  }
  // ponytail: trạng thái tính lúc đọc nên lọc/sắp/phân trang trong bộ nhớ, như voucher.
  const docs = await PromotionModel.find(filter).lean();
  const rows = docs
    .map((d) => ({ d, row: toRow(d, now) }))
    .filter((x) => !q.status || x.row.status === q.status)
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.row.status) - STATUS_ORDER.indexOf(b.row.status) ||
        (b.row.startDate?.getTime() ?? 0) - (a.row.startDate?.getTime() ?? 0),
    );
  const pageRows = rows.slice((q.page - 1) * q.limit, q.page * q.limit);
  const pageDocs = pageRows.map((x) => x.d);
  const [info, stats] = await Promise.all([
    analyze(pageDocs),
    orderStats(pageDocs.map((d) => d._id)),
  ]);
  return {
    data: pageRows.map(({ row }) => ({
      ...row,
      orderCount: stats.get(row.id)?.orders ?? 0,
      flags: row.status === 'ENDED' ? [] : (info.get(row.id)?.flags ?? []),
    })),
    meta: {
      page: q.page,
      limit: q.limit,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / q.limit)),
    },
  };
}

async function load(id: string): Promise<PromotionDoc> {
  const p = Types.ObjectId.isValid(id) ? await PromotionModel.findById(id).lean() : null;
  if (!p) throw notFound();
  return p;
}

export async function getPromotion(id: string, now = new Date()) {
  const p = await load(id);
  const [info, stats] = await Promise.all([analyze([p]), orderStats([p._id])]);
  const a = info.get(id)!;
  const s = scopeOf(p);
  return {
    ...toRow(p, now),
    description: p.description ?? '',
    productIds: s.productIds,
    categoryIds: s.categoryIds,
    excludedProductIds: s.excludedProductIds,
    pauseReason: p.pauseReason ?? null,
    endedAt: p.endedAt ?? null,
    canDelete: !hasRun(p, now) && promotionStatus(p, now) !== 'ENDED',
    orderCount: stats.get(id)?.orders ?? 0,
    totalDiscount: stats.get(id)?.discount ?? 0,
    flags: a.flags,
    lines: a.lines.slice(0, 500),
    linesTruncated: a.lines.length > 500,
  };
}

/** Xem trước giá không lưu (bảng xem trước ở form). */
export async function previewPromotion(input: Partial<CreatePromotionInput>) {
  const all = await loadProducts();
  const scope: Scope = {
    scopeType: input.scopeType,
    productIds: input.productIds ?? [],
    categoryIds: input.categoryIds ?? [],
    excludedProductIds: input.excludedProductIds ?? [],
  };
  const products = productsOf(scope, all).filter((p) => p.status === 'ACTIVE');
  const variants = await VariantModel.find(
    { productId: { $in: products.map((p) => p._id) }, status: 'ACTIVE' },
    '_id productId sku salePrice',
  ).lean();
  const names = new Map(products.map((p) => [String(p._id), p.name]));
  const rule =
    input.discountType && input.discountValue != null
      ? {
          discountType: input.discountType,
          discountValue: input.discountValue,
          maxDiscountValue: input.maxDiscountValue,
        }
      : null;
  const lines = variants.slice(0, 500).map((v) => {
    const pv = rule
      ? previewLine(v.salePrice, rule)
      : { price: v.salePrice, finalPrice: v.salePrice, percent: 0 };
    return {
      variantId: String(v._id),
      productName: names.get(String(v.productId)),
      sku: v.sku,
      ...pv,
    };
  });
  return { lines, total: variants.length, needsConfirm: lines.some((l) => l.percent > 50) };
}

// ---------- Tạo / sửa ----------

async function nextCode(now: Date): Promise<string> {
  const prefix = promotionCode(now, 0).slice(0, -3);
  const n = await PromotionModel.countDocuments({ code: { $regex: `^${prefix}` } });
  return promotionCode(now, n + 1);
}

const toMerged = (i: Partial<CreatePromotionInput> & { name: string }): Merged => ({
  scopeType: i.scopeType,
  name: i.name,
  description: i.description,
  startDate: i.startNow ? undefined : i.startDate,
  endDate: i.endDate,
  discountType: i.discountType,
  discountValue: i.discountValue,
  maxDiscountValue: i.maxDiscountValue,
  productIds: i.productIds ?? [],
  categoryIds: i.categoryIds ?? [],
  excludedProductIds: i.excludedProductIds ?? [],
});

const snapshotOf = (variants: Checked['variants']) =>
  variants.map((v) => ({ variantId: v._id, price: v.salePrice }));

export async function createPromotion(
  actorId: string,
  input: CreatePromotionInput,
  now = new Date(),
) {
  const m = toMerged(input);
  if (input.startNow) m.startDate = now;
  let checked: Checked | null = null;
  if (input.activate) {
    checked = await validateActive(m, null, now, {
      checkStart: !input.startNow,
      endAfterNowHour: false,
      excludeConflicts: input.excludeConflicts,
      confirmHigh: input.confirmHighDiscount,
    });
  } else if (m.startDate && m.endDate && m.endDate <= m.startDate) {
    throw new AppError('E-MKT-004-03', 400, 'Thời gian kết thúc phải sau thời gian bắt đầu.');
  }
  const state: PromotionState = input.activate ? 'ACTIVE' : 'DRAFT';
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await PromotionModel.create({
        code: await nextCode(now),
        name: m.name,
        description: m.description,
        scopeType: m.scopeType,
        discountType: m.discountType,
        discountValue: m.discountValue,
        maxDiscountValue:
          m.discountType === 'PERCENT' ? (m.maxDiscountValue ?? undefined) : undefined,
        startDate: m.startDate,
        endDate: m.endDate,
        targets: targetsOf(m),
        excludedProductIds: m.excludedProductIds.map(oid),
        state,
        status: legacyStatus(state),
        everRan: false,
        priceSnapshot: checked ? snapshotOf(checked.variants) : [],
      });
      logAdminAction(actorId, input.activate ? 'PROMOTION_ACTIVATE' : 'PROMOTION_DRAFT', doc.code!);
      return await getPromotion(String(doc._id), now);
    } catch (e) {
      // Hai người cùng tạo trong một phút: mã trùng, thử lại với số kế tiếp.
      if ((e as { code?: number }).code !== 11000 || attempt >= 3) throw e;
    }
  }
}

export async function updatePromotion(
  actorId: string,
  id: string,
  patch: UpdatePromotionInput,
  now = new Date(),
) {
  const p = await load(id);
  const { version, activate, confirmHighDiscount, excludeConflicts, ...fields } = patch;
  if ((p.version ?? 0) !== version) throw conflict409();
  const status = promotionStatus(p, now);
  const cur = scopeOf(p);
  const current: Record<string, unknown> = {
    scopeType: cur.scopeType,
    name: p.name,
    description: p.description ?? '',
    startDate: p.startDate?.getTime(),
    endDate: p.endDate?.getTime(),
    discountType: p.discountType,
    discountValue: p.discountValue,
    maxDiscountValue: p.maxDiscountValue ?? null,
    productIds: [...cur.productIds].sort(),
    categoryIds: [...cur.categoryIds].sort(),
    excludedProductIds: [...cur.excludedProductIds].sort(),
  };
  const norm = (k: string, v: unknown): unknown =>
    v instanceof Date
      ? v.getTime()
      : Array.isArray(v)
        ? [...v].sort()
        : k === 'maxDiscountValue'
          ? (v ?? null)
          : v;
  const changed = Object.entries(fields)
    .filter(([k, v]) => v !== undefined && !same(norm(k, v), current[k]))
    .map(([k]) => k);
  const activating = !!activate && status === 'DRAFT';
  checkEdit(status, changed);
  if (changed.length === 0 && !activating) {
    return { ...(await getPromotion(id, now)), unchanged: true };
  }

  const m: Merged = {
    ...cur,
    name: p.name,
    description: p.description,
    startDate: p.startDate,
    endDate: p.endDate,
    discountType: p.discountType,
    discountValue: p.discountValue,
    maxDiscountValue: p.maxDiscountValue ?? null,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
  } as Merged;
  if (fields.startNow) m.startDate = now;

  let state: PromotionState = p.state ?? (status === 'PAUSED' ? 'PAUSED' : 'ACTIVE');
  if (status === 'DRAFT' && !activating) state = 'DRAFT';
  else if (activating) state = 'ACTIVE';

  let snapshot = p.priceSnapshot ?? [];
  if (state !== 'DRAFT') {
    const startChanged =
      changed.includes('startDate') || changed.includes('startNow') || activating;
    const checked = await validateActive(m, id, now, {
      checkStart: startChanged && !fields.startNow,
      endAfterNowHour: (status === 'RUNNING' || status === 'PAUSED') && changed.includes('endDate'),
      excludeConflicts,
      confirmHigh: confirmHighDiscount,
    });
    const known = new Set(snapshot.map((s) => String(s.variantId)));
    snapshot = [
      ...snapshot,
      ...snapshotOf(checked.variants).filter((s) => !known.has(String(s.variantId))),
    ];
  } else if (m.startDate && m.endDate && m.endDate <= m.startDate) {
    throw new AppError('E-MKT-004-03', 400, 'Thời gian kết thúc phải sau thời gian bắt đầu.');
  }

  const res = await PromotionModel.updateOne(
    { _id: id, version: p.version ?? 0 },
    {
      $set: {
        name: m.name,
        description: m.description,
        scopeType: m.scopeType,
        discountType: m.discountType,
        discountValue: m.discountValue,
        maxDiscountValue:
          m.discountType === 'PERCENT' ? (m.maxDiscountValue ?? undefined) : undefined,
        startDate: m.startDate,
        endDate: m.endDate,
        targets: targetsOf(m),
        excludedProductIds: m.excludedProductIds.map(oid),
        state,
        status: legacyStatus(state),
        priceSnapshot: snapshot,
      },
      $inc: { version: 1 },
    },
  );
  if (res.modifiedCount === 0) throw conflict409();

  const before = new Set(productsOfPromo(p, await loadProducts()));
  const after = new Set(productsOf(m, await loadProducts()).map((x) => String(x._id)));
  const removed = [...before].filter((x) => !after.has(x));
  if (removed.length && state !== 'DRAFT') {
    logAdminAction(actorId, 'PROMOTION_PRODUCT_REMOVED', p.code ?? id, { productIds: removed });
  }
  logAdminAction(actorId, 'PROMOTION_UPDATE', p.code ?? id, { changed });
  return getPromotion(id, now);
}

const productsOfPromo = (p: PromotionDoc, all: ProductLite[]): string[] =>
  productsOf(scopeOf(p), all).map((x) => String(x._id));

// ---------- Chuyển trạng thái ----------

async function setState(
  id: string,
  version: number,
  state: PromotionState,
  extra: Partial<PromotionDoc> = {},
) {
  const res = await PromotionModel.updateOne(
    { _id: id, version },
    { $set: { state, status: legacyStatus(state), ...extra }, $inc: { version: 1 } },
  );
  if (res.modifiedCount === 0) throw conflict409();
}

export async function deletePromotion(actorId: string, id: string, now = new Date()) {
  const p = await load(id);
  checkTransition('delete', p, promotionStatus(p, now), now);
  await PromotionModel.deleteOne({ _id: id });
  logAdminAction(actorId, 'PROMOTION_DELETE', p.code ?? id);
  return { deleted: true };
}

export async function deactivatePromotion(actorId: string, id: string, now = new Date()) {
  const p = await load(id);
  checkTransition('deactivate', p, promotionStatus(p, now), now);
  await setState(id, p.version ?? 0, 'DRAFT');
  logAdminAction(actorId, 'PROMOTION_DEACTIVATE', p.code ?? id);
  return getPromotion(id, now);
}

export async function pausePromotion(
  actorId: string,
  id: string,
  reason: PauseReason,
  note: string | undefined,
  now = new Date(),
) {
  checkReason(reason, note);
  const p = await load(id);
  checkTransition('pause', p, promotionStatus(p, now), now);
  await setState(id, p.version ?? 0, 'PAUSED', {
    everRan: true,
    pauseReason: note ? `${reason}: ${note}` : reason,
  });
  logAdminAction(actorId, 'PROMOTION_PAUSED', p.code ?? id, { reason, note });
  return getPromotion(id, now);
}

export async function resumePromotion(actorId: string, id: string, now = new Date()) {
  const p = await load(id);
  checkTransition('resume', p, promotionStatus(p, now), now);
  const all = await loadProducts();
  const mine = productsOfPromo(p, all);
  const found = findConflicts(
    mine,
    await occupants(id, all, now),
    now > p.startDate ? now : p.startDate,
    p.endDate,
  );
  if (found.size > 0) {
    throw conflictError(found, new Map(all.map((x) => [String(x._id), x.name])), 'E-MKT-006-04');
  }
  await setState(id, p.version ?? 0, 'ACTIVE', { pauseReason: null });
  logAdminAction(actorId, 'PROMOTION_RESUMED', p.code ?? id);
  return getPromotion(id, now);
}

/** Kết thúc sớm hàng loạt (≤ 20). Kiểm tra hết rồi mới ghi. */
export async function endPromotions(
  actorId: string,
  ids: string[],
  reason: PauseReason,
  note: string | undefined,
  now = new Date(),
) {
  if (ids.length > 20) {
    throw new AppError('E-MKT-006-05', 400, 'Chỉ có thể kết thúc tối đa 20 chương trình mỗi lần.');
  }
  checkReason(reason, note);
  const docs = await Promise.all(ids.map(load));
  for (const p of docs) checkTransition('end', p, promotionStatus(p, now), now);
  for (const p of docs) {
    await setState(String(p._id), p.version ?? 0, 'ENDED', {
      everRan: true,
      endedAt: now,
      pauseReason: note ? `${reason}: ${note}` : reason,
    });
    logAdminAction(actorId, 'PROMOTION_ENDED', p.code ?? String(p._id), { reason, note });
  }
  return { ended: docs.length };
}

/** "Nhân bản": bản nháp mới cùng cấu hình, bỏ thời gian để người dùng chọn lại. */
export async function duplicatePromotion(actorId: string, id: string, now = new Date()) {
  const p = await load(id);
  const s = scopeOf(p);
  const status: PromotionStatus = promotionStatus(p, now);
  const doc = await PromotionModel.create({
    code: await nextCode(now),
    name: `${p.name} (bản sao)`.slice(0, 100),
    description: p.description,
    scopeType: s.scopeType,
    discountType: p.discountType,
    discountValue: p.discountValue,
    maxDiscountValue: p.maxDiscountValue,
    targets: p.targets.map(({ productId, categoryId }) => ({ productId, categoryId })),
    excludedProductIds: p.excludedProductIds ?? [],
    state: 'DRAFT',
    status: 'PAUSED',
    everRan: false,
  });
  logAdminAction(actorId, 'PROMOTION_DUPLICATE', doc.code!, { from: p.code, fromStatus: status });
  return getPromotion(String(doc._id), now);
}
