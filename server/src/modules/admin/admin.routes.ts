import { Router, raw, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
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
  getProduct,
  listCategoryOptions,
  listProducts,
  setProductStatus,
  updateProduct,
  type AdminProductQuery,
  type StockAdjustment,
} from './admin-product.service.js';
import {
  bulkIdsSchema,
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

adminRouter.get('/categories/options', PRODUCT, async (_req, res) => {
  sendData(res, await listCategoryOptions());
});

adminRouter.get('/products/:id', PRODUCT, validate({ params: idParamsSchema }), async (req, res) => {
  sendData(res, await getProduct(paramId(req)));
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
