import { Router, raw, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { ADMIN_ROLE_NAMES, RoleName } from '../../lib/shared-enums.js';
import { sendData, sendPage } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { detectFile, readMultipart } from '../../utils/file-upload.js';
import { writeAudit } from './audit-log.model.js';
import { getOverview, getProductDashboard, type DashboardPeriod } from './admin-dashboard.service.js';
import {
  cancelOrderByAdmin,
  confirmOrder,
  getOrder,
  listOrders,
  type AdminOrderQuery,
} from './admin-order.service.js';
import {
  adjustStock,
  createProduct,
  deleteProduct,
  getProduct,
  listCategoryOptions,
  listProducts,
  setProductStatus,
  updateProduct,
  type AdminProductQuery,
  type StockAdjustment,
} from './admin-product.service.js';
import { createCategory, listCategories, setCategoryStatus, updateCategory } from './admin-category.service.js';
import {
  inventorySummary,
  listInventory,
  listNotifications,
  markNotificationsRead,
  setThreshold,
  stockHistory,
  type HistoryQuery,
  type InventoryQuery,
} from './admin-inventory.service.js';
import { listReviews, moderateReview, type ModerationDecision, type ReviewQuery } from './admin-review.service.js';
import {
  applySuggestedTiers,
  setShippingTier,
  shippingOverview,
  type ShippingQuery,
} from './admin-shipping.service.js';
import {
  bulkIdsSchema,
  bulkModerateSchema,
  categoryInputSchema,
  categoryStatusSchema,
  historyQuerySchema,
  inventoryQuerySchema,
  moderateSchema,
  reviewQuerySchema,
  shippingQuerySchema,
  shippingTierSchema,
  thresholdSchema,
  type CategoryInput,
  bulkImportSchema,
  bulkProductStatusSchema,
  cancelOrderSchema,
  idParamsSchema,
  orderListQuerySchema,
  overviewQuerySchema,
  productInputSchema,
  productListQuerySchema,
  type ProductInput,
  productStatusSchema,
  stockAdjustSchema,
  variantParamsSchema,
} from './admin.schema.js';

const SA = RoleName.SUPER_ADMIN;
const PRODUCT = requireRole(SA, RoleName.PRODUCT_ADMIN);
const ORDER = requireRole(SA, RoleName.ORDER_ADMIN);
const ANY_ADMIN = requireRole(...ADMIN_ROLE_NAMES);

const adminId = (req: Request) => new Types.ObjectId(req.user!.id);
const paramId = (req: Request, key = 'id') => new Types.ObjectId(String(req.params[key]));

/** API quản trị theo ma trận phân quyền (requirements Phần B mục 5); mọi route cần đăng nhập. */
export const adminRouter = Router();
adminRouter.use(requireAuth);

// --- Dashboard ---
adminRouter.get(
  '/dashboard/overview',
  requireRole(SA),
  validate({ query: overviewQuerySchema }),
  async (_req, res) => {
    const { period } = res.locals['query'] as { period: DashboardPeriod };
    sendData(res, await getOverview(period));
  },
);

adminRouter.get('/dashboard/products', PRODUCT, async (_req, res) => {
  sendData(res, await getProductDashboard());
});

// --- Đơn hàng (OA-03, OA-04, OA-06) ---
adminRouter.get('/orders', ORDER, validate({ query: orderListQuerySchema }), async (_req, res) => {
  const result = await listOrders(res.locals['query'] as AdminOrderQuery);
  res.json({ success: true, data: result.data, meta: result.meta, statusCounts: result.statusCounts });
});

adminRouter.get('/orders/:id', ORDER, validate({ params: idParamsSchema }), async (req, res) => {
  sendData(res, await getOrder(paramId(req)));
});

adminRouter.post('/orders/bulk-confirm', ORDER, validate({ body: bulkIdsSchema }), async (req, res) => {
  const { ids } = req.body as { ids: string[] };
  const confirmed: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const order = await confirmOrder(new Types.ObjectId(id), adminId(req));
    if (!order) {
      skipped.push(id);
      continue;
    }
    confirmed.push(order.orderCode);
    await writeAudit(req, {
      action: 'ORDER_CONFIRM',
      targetType: 'order',
      targetId: id,
      oldValue: { status: 'PENDING_CONFIRMATION' },
      newValue: { status: 'CONFIRMED', label: `#${order.orderCode}` },
    });
  }
  sendData(res, { confirmed, skipped });
});

adminRouter.post(
  '/orders/:id/confirm',
  ORDER,
  validate({ params: idParamsSchema }),
  async (req, res) => {
    const order = await confirmOrder(paramId(req), adminId(req));
    if (!order) {
      throw new AppError('ORDER_INVALID_STATE', 409, 'Chỉ xác nhận được đơn đang chờ xác nhận');
    }
    await writeAudit(req, {
      action: 'ORDER_CONFIRM',
      targetType: 'order',
      targetId: String(order._id),
      oldValue: { status: 'PENDING_CONFIRMATION' },
      newValue: { status: 'CONFIRMED', label: `#${order.orderCode}` },
    });
    sendData(res, await getOrder(order._id));
  },
);

adminRouter.post(
  '/orders/:id/cancel',
  ORDER,
  validate({ params: idParamsSchema, body: cancelOrderSchema }),
  async (req, res) => {
    const { reason } = req.body as { reason: string };
    const before = await getOrder(paramId(req));
    const order = await cancelOrderByAdmin(paramId(req), adminId(req), reason);
    await writeAudit(req, {
      action: 'ORDER_CANCEL',
      targetType: 'order',
      targetId: order.id,
      oldValue: { status: before.status },
      newValue: { status: 'CANCELLED', reason, label: `#${order.orderCode}` },
    });
    sendData(res, await getOrder(paramId(req)));
  },
);

// --- Sản phẩm & tồn kho (PA-03, PA-06, PA-08) ---
adminRouter.get('/products', PRODUCT, validate({ query: productListQuerySchema }), async (_req, res) => {
  const result = await listProducts(res.locals['query'] as AdminProductQuery);
  sendPage(res, result.data, result.meta);
});

adminRouter.post('/products', PRODUCT, validate({ body: productInputSchema }), async (req, res) => {
  const result = await createProduct(req.body as ProductInput, adminId(req));
  await writeAudit(req, {
    action: 'PRODUCT_CREATE',
    targetType: 'product',
    targetId: result.id,
    newValue: { productCode: result.productCode, label: result.name },
  });
  res.status(201);
  sendData(res, await getProduct(new Types.ObjectId(result.id)));
});

adminRouter.put(
  '/products/:id',
  PRODUCT,
  validate({ params: idParamsSchema, body: productInputSchema }),
  async (req, res) => {
    const result = await updateProduct(paramId(req), req.body as ProductInput, adminId(req));
    await writeAudit(req, {
      action: 'PRODUCT_UPDATE',
      targetType: 'product',
      targetId: result.id,
      oldValue: result.before,
      newValue: { label: result.name },
    });
    sendData(res, await getProduct(paramId(req)));
  },
);

/** Ảnh sản phẩm (PA-04): JPG/PNG/WebP tối đa 5 MB, lưu ở `uploads/products`. */
adminRouter.post(
  '/uploads/product-image',
  PRODUCT,
  raw({ type: 'multipart/form-data', limit: '6mb' }),
  async (req, res) => {
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION_ERROR', 400, 'Chưa chọn ảnh');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectFile(bytes);
    if (format.video) throw new AppError('VALIDATION_ERROR', 400, 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
    if (bytes.length > 5 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE', 413, 'Ảnh tối đa 5 MB');
    const name = `${randomUUID()}.${format.ext}`;
    const directory = path.resolve('uploads/products');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), bytes, { flag: 'wx' });
    res.status(201);
    sendData(res, { url: `/uploads/products/${name}` });
  },
);

/** Model 3D (PA-04, tùy chọn): tệp .glb tối đa 30 MB, lưu ở `uploads/models`. */
adminRouter.post(
  '/uploads/product-model',
  PRODUCT,
  raw({ type: 'multipart/form-data', limit: '31mb' }),
  async (req, res) => {
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION_ERROR', 400, 'Chưa chọn tệp model');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'glTF') {
      throw new AppError('UNSUPPORTED_FILE_TYPE', 415, 'Chỉ nhận model 3D định dạng .glb');
    }
    if (bytes.length > 30 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE', 413, 'Model 3D tối đa 30 MB');
    const name = `${randomUUID()}.glb`;
    const directory = path.resolve('uploads/models');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), bytes, { flag: 'wx' });
    res.status(201);
    sendData(res, { url: `/uploads/models/${name}` });
  },
);

adminRouter.get('/categories/options', PRODUCT, async (_req, res) => {
  sendData(res, await listCategoryOptions());
});

adminRouter.get('/products/:id', PRODUCT, validate({ params: idParamsSchema }), async (req, res) => {
  sendData(res, await getProduct(paramId(req)));
});

adminRouter.delete('/products/:id', PRODUCT, validate({ params: idParamsSchema }), async (req, res) => {
  const result = await deleteProduct(paramId(req));
  await writeAudit(req, {
    action: 'PRODUCT_DELETE',
    targetType: 'product',
    targetId: result.id,
    oldValue: { ...result.snapshot, label: result.name },
  });
  sendData(res, { id: result.id, name: result.name });
});

adminRouter.patch(
  '/products/:id/status',
  PRODUCT,
  validate({ params: idParamsSchema, body: productStatusSchema }),
  async (req, res) => {
    const result = await setProductStatus(paramId(req), (req.body as { status: never }).status);
    await writeAudit(req, {
      action: 'PRODUCT_STATUS',
      targetType: 'product',
      targetId: result.id,
      oldValue: { status: result.before },
      newValue: { status: result.status, label: result.name },
    });
    sendData(res, await getProduct(paramId(req)));
  },
);

adminRouter.post(
  '/products/bulk-status',
  PRODUCT,
  validate({ body: bulkProductStatusSchema }),
  async (req, res) => {
    const { ids, status } = req.body as { ids: string[]; status: never };
    const updated: string[] = [];
    const failed: { id: string; message: string; details?: unknown }[] = [];
    for (const id of ids) {
      try {
        const result = await setProductStatus(new Types.ObjectId(id), status);
        updated.push(result.name);
        await writeAudit(req, {
          action: 'PRODUCT_STATUS',
          targetType: 'product',
          targetId: id,
          oldValue: { status: result.before },
          newValue: { status, label: result.name },
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        failed.push({ id, message: error.message, details: error.details });
      }
    }
    sendData(res, { updated, failed });
  },
);

adminRouter.post(
  '/inventory/:variantId/adjust',
  PRODUCT,
  validate({ params: variantParamsSchema, body: stockAdjustSchema }),
  async (req, res) => {
    const body = req.body as StockAdjustment;
    const result = await adjustStock(paramId(req, 'variantId'), body, adminId(req));
    await writeAudit(req, {
      action: 'STOCK_ADJUST',
      targetType: 'variant',
      targetId: result.variantId,
      oldValue: { stockQuantity: result.before },
      newValue: { stockQuantity: result.after, changeType: body.changeType, label: result.sku },
    });
    sendData(res, result);
  },
);

adminRouter.post('/inventory/bulk-import', PRODUCT, validate({ body: bulkImportSchema }), async (req, res) => {
  const { items, note } = req.body as { items: { variantId: string; quantity: number }[]; note?: string };
  const results = [];
  for (const item of items) {
    const result = await adjustStock(
      new Types.ObjectId(item.variantId),
      { changeType: 'IMPORT', quantity: item.quantity, note },
      adminId(req),
    );
    results.push(result);
    await writeAudit(req, {
      action: 'STOCK_ADJUST',
      targetType: 'variant',
      targetId: result.variantId,
      oldValue: { stockQuantity: result.before },
      newValue: { stockQuantity: result.after, changeType: 'IMPORT', label: result.sku },
    });
  }
  sendData(res, { results });
});

adminRouter.get('/inventory', PRODUCT, validate({ query: inventoryQuerySchema }), async (_req, res) => {
  const result = await listInventory(res.locals['query'] as InventoryQuery);
  sendPage(res, result.data, result.meta);
});

adminRouter.get('/inventory/summary', PRODUCT, async (_req, res) => {
  sendData(res, await inventorySummary());
});

adminRouter.get('/inventory/history', PRODUCT, validate({ query: historyQuerySchema }), async (_req, res) => {
  const result = await stockHistory(res.locals['query'] as HistoryQuery);
  sendPage(res, result.data, result.meta);
});

adminRouter.patch(
  '/inventory/:variantId/threshold',
  PRODUCT,
  validate({ params: variantParamsSchema, body: thresholdSchema }),
  async (req, res) => {
    const { lowStockThreshold } = req.body as { lowStockThreshold: number };
    const result = await setThreshold(paramId(req, 'variantId'), lowStockThreshold);
    await writeAudit(req, {
      action: 'STOCK_THRESHOLD',
      targetType: 'variant',
      targetId: result.variantId,
      oldValue: { lowStockThreshold: result.before },
      newValue: { lowStockThreshold: result.after, label: result.sku },
    });
    sendData(res, result);
  },
);

// --- Danh mục & gợi ý phòng (PA-07) ---
adminRouter.get('/categories', PRODUCT, async (_req, res) => {
  sendData(res, await listCategories());
});

adminRouter.post('/categories', PRODUCT, validate({ body: categoryInputSchema }), async (req, res) => {
  const result = await createCategory(req.body as CategoryInput);
  await writeAudit(req, {
    action: 'CATEGORY_CREATE',
    targetType: 'category',
    targetId: result.id,
    newValue: { label: result.name },
  });
  res.status(201);
  sendData(res, result);
});

adminRouter.put(
  '/categories/:id',
  PRODUCT,
  validate({ params: idParamsSchema, body: categoryInputSchema }),
  async (req, res) => {
    const result = await updateCategory(paramId(req), req.body as CategoryInput);
    await writeAudit(req, {
      action: 'CATEGORY_UPDATE',
      targetType: 'category',
      targetId: result.id,
      oldValue: result.before,
      newValue: { label: result.name },
    });
    sendData(res, result);
  },
);

adminRouter.patch(
  '/categories/:id/status',
  PRODUCT,
  validate({ params: idParamsSchema, body: categoryStatusSchema }),
  async (req, res) => {
    const result = await setCategoryStatus(paramId(req), (req.body as { status: 'VISIBLE' | 'HIDDEN' }).status);
    await writeAudit(req, {
      action: 'CATEGORY_STATUS',
      targetType: 'category',
      targetId: result.id,
      oldValue: { status: result.before },
      newValue: { status: result.status, label: result.name },
    });
    sendData(res, result);
  },
);

// --- Kiểm duyệt đánh giá (PA-09) ---
adminRouter.get('/reviews', PRODUCT, validate({ query: reviewQuerySchema }), async (_req, res) => {
  const result = await listReviews(res.locals['query'] as ReviewQuery);
  res.json({ success: true, data: result.data, meta: result.meta, counts: result.counts });
});

async function auditModeration(
  req: Request,
  result: Awaited<ReturnType<typeof moderateReview>>,
  decision: ModerationDecision,
  reason?: string,
): Promise<void> {
  await writeAudit(req, {
    action: 'REVIEW_MODERATE',
    targetType: 'review',
    targetId: result.id,
    oldValue: { status: result.before },
    newValue: { status: result.status, decision, reason, label: result.label },
  });
}

adminRouter.post('/reviews/bulk-moderate', PRODUCT, validate({ body: bulkModerateSchema }), async (req, res) => {
  const { ids, decision, reason } = req.body as { ids: string[]; decision: ModerationDecision; reason?: string };
  const updated: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const id of ids) {
    try {
      const result = await moderateReview(new Types.ObjectId(id), decision, reason);
      updated.push(result.id);
      await auditModeration(req, result, decision, reason);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      failed.push({ id, message: error.message });
    }
  }
  sendData(res, { updated, failed });
});

adminRouter.post(
  '/reviews/:id/moderate',
  PRODUCT,
  validate({ params: idParamsSchema, body: moderateSchema }),
  async (req, res) => {
    const { decision, reason } = req.body as { decision: ModerationDecision; reason?: string };
    const result = await moderateReview(paramId(req), decision, reason);
    await auditModeration(req, result, decision, reason);
    sendData(res, result);
  },
);

// --- Cấp độ vận chuyển (ma trận mục 5) ---
adminRouter.get('/shipping-tiers', PRODUCT, validate({ query: shippingQuerySchema }), async (_req, res) => {
  const result = await shippingOverview(res.locals['query'] as ShippingQuery);
  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
    tiers: result.tiers,
    mismatchCount: result.mismatchCount,
  });
});

adminRouter.patch(
  '/variants/:variantId/shipping-tier',
  PRODUCT,
  validate({ params: variantParamsSchema, body: shippingTierSchema }),
  async (req, res) => {
    const { shippingTier } = req.body as { shippingTier: number };
    const result = await setShippingTier(paramId(req, 'variantId'), shippingTier);
    await writeAudit(req, {
      action: 'SHIPPING_TIER',
      targetType: 'variant',
      targetId: result.variantId,
      oldValue: { shippingTier: result.before },
      newValue: { shippingTier: result.after, label: result.sku },
    });
    sendData(res, result);
  },
);

adminRouter.post('/shipping-tiers/apply-suggested', PRODUCT, validate({ body: bulkIdsSchema }), async (req, res) => {
  const { ids } = req.body as { ids: string[] };
  const { results, skipped } = await applySuggestedTiers(ids.map((id) => new Types.ObjectId(id)));
  const changed = results.filter((r) => r.before !== r.after);
  for (const result of changed) {
    await writeAudit(req, {
      action: 'SHIPPING_TIER',
      targetType: 'variant',
      targetId: result.variantId,
      oldValue: { shippingTier: result.before },
      newValue: { shippingTier: result.after, label: result.sku },
    });
  }
  sendData(res, { updated: changed.length, skipped: skipped.length });
});

// --- Thông báo trong ứng dụng (chỉ Admin, lọc theo vai trò) ---
adminRouter.get('/notifications', ANY_ADMIN, async (req, res) => {
  sendData(res, await listNotifications(adminId(req), req.user!.roleName));
});

adminRouter.post('/notifications/read', ANY_ADMIN, async (req, res) => {
  const id = (req.body as { id?: string } | undefined)?.id;
  if (id && !Types.ObjectId.isValid(id)) throw new AppError('VALIDATION_ERROR', 400, 'Mã không hợp lệ');
  await markNotificationsRead(adminId(req), req.user!.roleName, id ? new Types.ObjectId(id) : undefined);
  sendData(res, { ok: true });
});
