import { Types, type PipelineStage } from 'mongoose';
import { VariantModel, type VariantDoc } from '../products/variant.model.js';
import { StockHistoryModel, type StockChangeType } from '../products/stock-history.model.js';
import { ProductModel } from '../products/product.model.js';
import { RoleModel, UserModel } from '../auth/auth.model.js';
import { RoleName, UserStatus } from '../../lib/shared-enums.js';
import { sendStockDigestEmail } from '../../integrations/resend.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../utils/app-error.js';
import { AdminNotificationModel, pushNotification } from './admin-notification.model.js';

const STOCK_ROLES = [RoleName.SUPER_ADMIN, RoleName.PRODUCT_ADMIN];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ngày theo giờ Việt Nam dạng `2026-11-01`, dùng làm khóa chống gửi trùng. */
export function vnDateKey(date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export interface InventoryQuery {
  q?: string;
  state?: 'OK' | 'LOW' | 'OUT';
  sort: 'stock' | '-stock' | 'sku' | 'name';
  page: number;
  limit: number;
}

/** PA-08: tồn kho theo từng biến thể đang bán, kèm sản phẩm và tình trạng so với ngưỡng. */
export async function listInventory(query: InventoryQuery) {
  const pipeline: PipelineStage[] = [
    { $match: { status: 'ACTIVE' } },
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
        pipeline: [{ $project: { name: 1, status: 1, productCode: 1, media: 1 } }],
      },
    },
    { $unwind: '$product' },
    { $match: { 'product.status': { $ne: 'DISCONTINUED' } } },
    {
      $addFields: {
        state: {
          $switch: {
            branches: [
              { case: { $eq: ['$stockQuantity', 0] }, then: 'OUT' },
              { case: { $lte: ['$stockQuantity', '$lowStockThreshold'] }, then: 'LOW' },
            ],
            default: 'OK',
          },
        },
      },
    },
  ];
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    const compact = new RegExp(escapeRegex(query.q.replace(/\./g, '').trim()), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'product.name': pattern },
          { sku: pattern },
          { $expr: { $regexMatch: { input: { $replaceAll: { input: '$sku', find: '.', replacement: '' } }, regex: compact } } },
          { color: pattern },
        ],
      },
    });
  }
  if (query.state) pipeline.push({ $match: { state: query.state } });
  const sort: Record<InventoryQuery['sort'], Record<string, 1 | -1>> = {
    stock: { stockQuantity: 1 },
    '-stock': { stockQuantity: -1 },
    sku: { sku: 1 },
    name: { 'product.name': 1, sku: 1 },
  };
  pipeline.push(
    { $sort: { ...sort[query.sort], _id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        total: [{ $count: 'count' }],
        states: [{ $group: { _id: '$state', count: { $sum: 1 }, units: { $sum: '$stockQuantity' } } }],
      },
    },
  );

  const [result] = await VariantModel.aggregate<{
    rows: (VariantDoc & {
      state: 'OK' | 'LOW' | 'OUT';
      product: { _id: Types.ObjectId; name: string; status: string; media?: { type: string; url: string; displayOrder: number }[] };
    })[];
    total: { count: number }[];
    states: { _id: string; count: number; units: number }[];
  }>(pipeline);

  const variantIds = result.rows.map((row) => row._id);
  const lastMoves = await StockHistoryModel.aggregate<{ _id: Types.ObjectId; at: Date }>([
    { $match: { variantId: { $in: variantIds } } },
    { $group: { _id: '$variantId', at: { $max: '$performedAt' } } },
  ]);
  const lastMoveById = new Map(lastMoves.map((m) => [String(m._id), m.at]));
  const total = result.total[0]?.count ?? 0;

  return {
    data: result.rows.map((row) => ({
      variantId: String(row._id),
      productId: String(row.product._id),
      productName: row.product.name,
      productStatus: row.product.status,
      thumbnail:
        (row.product.media ?? []).filter((m) => m.type === 'IMAGE').sort((a, b) => a.displayOrder - b.displayOrder)[0]?.url ??
        null,
      sku: row.sku,
      color: row.color ?? '',
      material: row.material ?? '',
      stockQuantity: row.stockQuantity,
      lowStockThreshold: row.lowStockThreshold,
      state: row.state,
      lastMovementAt: lastMoveById.get(String(row._id)) ?? null,
    })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

/** Số liệu cột phải trang Tồn kho: tổng tồn, số biến thể theo tình trạng, biến động 7 ngày. */
export async function inventorySummary() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [states, moves] = await Promise.all([
    VariantModel.aggregate<{ _id: string; count: number; units: number }>([
      { $match: { status: 'ACTIVE' } },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
          pipeline: [{ $project: { status: 1 } }],
        },
      },
      { $match: { 'product.status': { $ne: 'DISCONTINUED' } } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ['$stockQuantity', 0] }, then: 'OUT' },
                { case: { $lte: ['$stockQuantity', '$lowStockThreshold'] }, then: 'LOW' },
              ],
              default: 'OK',
            },
          },
          count: { $sum: 1 },
          units: { $sum: '$stockQuantity' },
        },
      },
    ]),
    StockHistoryModel.aggregate<{ _id: StockChangeType; count: number; quantity: number }>([
      { $match: { performedAt: { $gte: since } } },
      { $group: { _id: '$changeType', count: { $sum: 1 }, quantity: { $sum: '$quantityChange' } } },
    ]),
  ]);
  const byState = Object.fromEntries(states.map((s) => [s._id, s]));
  return {
    totalUnits: states.reduce((sum, s) => sum + s.units, 0),
    variants: {
      ok: byState['OK']?.count ?? 0,
      low: byState['LOW']?.count ?? 0,
      out: byState['OUT']?.count ?? 0,
    },
    last7Days: {
      imported: moves.find((m) => m._id === 'IMPORT')?.quantity ?? 0,
      sold: -(moves.find((m) => m._id === 'SALE')?.quantity ?? 0),
      movements: moves.reduce((sum, m) => sum + m.count, 0),
    },
  };
}

export interface HistoryQuery {
  variantId?: string;
  changeType?: StockChangeType[];
  page: number;
  limit: number;
}

/** PA-08: lịch sử biến động tồn kho (mới nhất trước), kèm SKU, sản phẩm và người thực hiện. */
export async function stockHistory(query: HistoryQuery) {
  const match: Record<string, unknown> = {};
  if (query.variantId) match['variantId'] = new Types.ObjectId(query.variantId);
  if (query.changeType?.length) match['changeType'] = { $in: query.changeType };
  const [rows, total] = await Promise.all([
    StockHistoryModel.find(match)
      .sort({ performedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    StockHistoryModel.countDocuments(match),
  ]);
  const variants = await VariantModel.find({ _id: { $in: rows.map((r) => r.variantId) } })
    .select('sku color productId')
    .lean();
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const [products, users] = await Promise.all([
    ProductModel.find({ _id: { $in: variants.map((v) => v.productId) } }).select('name').lean(),
    UserModel.find({ _id: { $in: rows.map((r) => r.performedBy).filter(Boolean) } })
      .select('profile.fullName')
      .lean(),
  ]);
  const productName = new Map(products.map((p) => [String(p._id), p.name]));
  const userName = new Map(users.map((u) => [String(u._id), u.profile?.fullName ?? '']));

  return {
    data: rows.map((row) => {
      const variant = variantById.get(String(row.variantId));
      return {
        id: String(row._id),
        variantId: String(row.variantId),
        sku: variant?.sku ?? '—',
        color: variant?.color ?? '',
        productName: variant ? (productName.get(String(variant.productId)) ?? '') : '',
        changeType: row.changeType,
        quantityChange: row.quantityChange,
        quantityAfter: row.quantityAfter,
        note: row.note ?? '',
        performedBy: row.performedBy ? (userName.get(String(row.performedBy)) ?? 'Admin') : 'Hệ thống',
        orderId: row.orderId ? String(row.orderId) : null,
        performedAt: row.performedAt,
      };
    }),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

/** PA-08: đổi ngưỡng cảnh báo của một biến thể. */
export async function setThreshold(variantId: Types.ObjectId, lowStockThreshold: number) {
  const variant = await VariantModel.findById(variantId);
  if (!variant) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy biến thể');
  const before = variant.lowStockThreshold;
  variant.lowStockThreshold = lowStockThreshold;
  await variant.save();
  await notifyStockLevels([variant._id]);
  return { variantId: String(variant._id), sku: variant.sku, before, after: lowStockThreshold };
}

/**
 * PA-08: báo cho Product Admin khi biến thể xuống dưới ngưỡng hoặc hết hàng.
 * Mỗi biến thể chỉ báo một lần cho mỗi mức trong ngày (`dedupeKey`).
 */
export async function notifyStockLevels(variantIds: Types.ObjectId[]): Promise<void> {
  if (!variantIds.length) return;
  const variants = await VariantModel.find({ _id: { $in: variantIds }, status: 'ACTIVE' })
    .select('sku color stockQuantity lowStockThreshold productId')
    .lean();
  const low = variants.filter((v) => v.stockQuantity <= v.lowStockThreshold);
  if (!low.length) return;
  const products = await ProductModel.find({ _id: { $in: low.map((v) => v.productId) }, status: { $ne: 'DISCONTINUED' } })
    .select('name')
    .lean();
  const nameById = new Map(products.map((p) => [String(p._id), p.name]));
  const day = vnDateKey();
  for (const v of low) {
    const name = nameById.get(String(v.productId));
    if (!name) continue;
    const out = v.stockQuantity === 0;
    await pushNotification({
      type: out ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      roleNames: STOCK_ROLES,
      title: out ? `${name} đã hết hàng` : `${name} sắp hết hàng`,
      detail: `${v.sku}${v.color ? ` · ${v.color}` : ''} · còn ${v.stockQuantity}/${v.lowStockThreshold}`,
      link: `/ton-kho?q=${encodeURIComponent(v.sku)}`,
      targetId: String(v._id),
      dedupeKey: `${out ? 'OUT' : 'LOW'}:${String(v._id)}:${day}`,
    });
  }
}

/** Gọi sau khi đơn trừ kho; lỗi chỉ ghi log để không ảnh hưởng đặt hàng. */
export function notifyStockLevelsInBackground(variantIds: Types.ObjectId[]): void {
  notifyStockLevels(variantIds).catch((error: unknown) => logger.warn({ error }, 'Không tạo được cảnh báo tồn kho'));
}

/** Chuông thông báo: 30 thông báo mới nhất thuộc vai trò, kèm số chưa đọc. */
export async function listNotifications(userId: Types.ObjectId, roleName: RoleName) {
  const filter = { roleNames: roleName };
  const [rows, unread] = await Promise.all([
    AdminNotificationModel.find(filter).sort({ createdAt: -1 }).limit(30).lean(),
    AdminNotificationModel.countDocuments({ ...filter, readBy: { $ne: userId } }),
  ]);
  return {
    unread,
    data: rows.map((row) => ({
      id: String(row._id),
      type: row.type,
      title: row.title,
      detail: row.detail,
      link: row.link,
      read: row.readBy.some((id) => id.equals(userId)),
      createdAt: row.createdAt,
    })),
  };
}

export async function markNotificationsRead(userId: Types.ObjectId, roleName: RoleName, id?: Types.ObjectId) {
  await AdminNotificationModel.updateMany(
    { roleNames: roleName, ...(id ? { _id: id } : {}) },
    { $addToSet: { readBy: userId } },
  );
}

/**
 * PA-08: email tóm tắt tồn kho hằng ngày cho Product Admin. Chạy trong worker;
 * thông báo `STOCK_DIGEST` theo ngày vừa là nhật ký vừa chặn gửi hai lần.
 */
export async function sendDailyStockDigest(now = new Date()): Promise<boolean> {
  const day = vnDateKey(now);
  const dedupeKey = `DIGEST:${day}`;
  if (await AdminNotificationModel.exists({ dedupeKey })) return false;

  const variants = await VariantModel.find({ status: 'ACTIVE', $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } })
    .select('sku color stockQuantity lowStockThreshold productId')
    .sort({ stockQuantity: 1 })
    .lean();
  const products = await ProductModel.find({
    _id: { $in: variants.map((v) => v.productId) },
    status: { $ne: 'DISCONTINUED' },
  })
    .select('name')
    .lean();
  const nameById = new Map(products.map((p) => [String(p._id), p.name]));
  const lines = variants
    .filter((v) => nameById.has(String(v.productId)))
    .map((v) => ({
      name: nameById.get(String(v.productId))!,
      sku: v.sku,
      color: v.color ?? '',
      stock: v.stockQuantity,
      threshold: v.lowStockThreshold,
    }));
  const outCount = lines.filter((l) => l.stock === 0).length;

  const roles = await RoleModel.find({ name: { $in: STOCK_ROLES } }).select('_id name').lean();
  const productRole = roles.find((r) => r.name === RoleName.PRODUCT_ADMIN);
  const recipients = await UserModel.find({
    roleId: { $in: productRole ? [productRole._id] : roles.map((r) => r._id) },
    status: UserStatus.ACTIVE,
    email: { $nin: [null, ''] },
  })
    .select('email')
    .lean();

  if (lines.length) {
    for (const user of recipients) {
      await sendStockDigestEmail(user.email!, day, lines);
    }
  }
  await pushNotification({
    type: 'STOCK_DIGEST',
    roleNames: STOCK_ROLES,
    title: lines.length ? `Tóm tắt tồn kho ${day.split('-').reverse().join('/')}` : 'Tồn kho ổn định hôm nay',
    detail: lines.length
      ? `${lines.length - outCount} sắp hết, ${outCount} hết hàng · đã gửi email cho ${recipients.length} người`
      : 'Không có biến thể nào dưới ngưỡng cảnh báo',
    link: '/ton-kho?state=LOW',
    dedupeKey,
  });
  return true;
}
