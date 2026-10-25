import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireCustomer } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';
import { sendData } from '../../utils/response.js';
import { VariantModel } from '../products/variant.model.js';
import { ProductModel } from '../products/product.model.js';
import { getProductDetail } from '../products/product.service.js';
import { OrderModel } from '../after-sales/after-sales.model.js';
import type { UserDoc } from '../auth/auth.model.js';

const itemSchema = z.object({ variantId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().min(1).max(99) });
const cartSchema = z.object({ items: z.array(itemSchema).min(1).max(50) }).refine(
  (data) => new Set(data.items.map((item) => item.variantId.toLowerCase())).size === data.items.length,
  { message: 'Mỗi mẫu sản phẩm chỉ được xuất hiện một lần.' },
);
const orderSchema = cartSchema.safeExtend({
  requestId: z.string().uuid(), expectedTotal: z.number().finite().nonnegative(),
  shippingAddress: z.object({
    recipientName: z.string().trim().min(2).max(100),
    recipientPhone: z.string().trim().regex(/^(?:0|\+84)[0-9]{9,10}$/),
    addressLine: z.string().trim().min(10).max(500),
  }),
});

async function quote(items: z.infer<typeof itemSchema>[]) {
  const variants = await VariantModel.find({ _id: { $in: items.map((item) => item.variantId) }, status: 'ACTIVE' }).lean();
  const products = await ProductModel.find({ _id: { $in: variants.map((v) => v.productId) }, status: 'ACTIVE' }).lean();
  const details = await Promise.all(products.map((product) => getProductDetail(product.slug)));
  const lines = items.map((item) => {
    const variant = variants.find((v) => v._id.toString() === item.variantId.toLowerCase());
    const product = details.find((p) => p?.id === variant?.productId.toString());
    const priced = product?.variants.find((v) => v.id === item.variantId.toLowerCase());
    if (!variant || !product || !priced || variant.stockQuantity < item.quantity)
      throw new AppError('OUT_OF_STOCK', 409, 'Một mẫu sản phẩm đã ngừng bán hoặc không đủ số lượng. Vui lòng cập nhật giỏ hàng.');
    const installationFee = variant.installationService === 'REQUIRED' ? variant.installationFee ?? 0 : 0;
    return { variantId: priced.id, name: product.name, sku: priced.sku, quantity: item.quantity,
      unitPrice: priced.price.final, installationFee, finalAmount: (priced.price.final + installationFee) * item.quantity };
  });
  return { items: lines, totalAmount: lines.reduce((sum, line) => sum + line.finalAmount, 0) };
}

export const checkoutRoutes = Router();
checkoutRoutes.post('/quote', validateBody(cartSchema), asyncHandler(async (_req, res) => {
  sendData(res, await quote((res.locals['body'] as z.infer<typeof cartSchema>).items));
}));
checkoutRoutes.post('/', requireCustomer, validateBody(orderSchema), asyncHandler(async (_req, res) => {
  const body = res.locals['body'] as z.infer<typeof orderSchema>;
  const user = res.locals['user'] as UserDoc;
  const checkoutKey = `${user._id}:${body.requestId}`;
  await OrderModel.init();
  const dto = (order: { orderCode: string; totalAmount: number }) => ({ orderCode: order.orderCode, totalAmount: order.totalAmount });
  const previous = await OrderModel.findOne({ checkoutKey }).lean();
  if (previous) { sendData(res, dto(previous)); return; }
  const priced = await quote(body.items);
  if (priced.totalAmount !== body.expectedTotal)
    throw new AppError('PRICE_CHANGED', 409, 'Giá sản phẩm đã thay đổi. Vui lòng cập nhật tổng tiền trước khi đặt hàng.');
  const reserved: z.infer<typeof itemSchema>[] = [];
  try {
    for (const item of body.items) {
      const result = await VariantModel.updateOne({ _id: item.variantId, status: 'ACTIVE', stockQuantity: { $gte: item.quantity } }, { $inc: { stockQuantity: -item.quantity } });
      if (result.modifiedCount !== 1) throw new AppError('OUT_OF_STOCK', 409, 'Sản phẩm vừa hết hàng. Vui lòng cập nhật giỏ hàng.');
      reserved.push(item);
    }
    const order = await OrderModel.create({
      userId: user._id, checkoutKey, orderCode: `CV-${randomUUID().toUpperCase()}`,
      status: 'PENDING', createdAt: new Date(), shippingAddress: body.shippingAddress,
      totalAmount: priced.totalAmount,
      items: priced.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity,
        snapshot: { name: item.name, sku: item.sku }, finalAmount: item.finalAmount })),
      paymentMethod: 'COD', paymentStatus: 'UNPAID', shippingFeeStatus: 'AWAITING_CONFIRMATION',
    });
    res.status(201); sendData(res, dto(order));
  } catch (error) {
    for (const item of reserved) await VariantModel.updateOne({ _id: item.variantId }, { $inc: { stockQuantity: item.quantity } });
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const order = await OrderModel.findOne({ checkoutKey }).lean();
      if (order) { sendData(res, dto(order)); return; }
    }
    throw error;
  }
}));
