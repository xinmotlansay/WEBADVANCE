import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Mã không hợp lệ');

/** `?status=A,B` thành mảng; bỏ giá trị không thuộc danh sách cho phép. */
function csvEnum<T extends string>(values: readonly [T, ...T[]]) {
  return z
    .string()
    .optional()
    .transform((raw) =>
      raw ? raw.split(',').filter((v): v is T => (values as readonly string[]).includes(v)) : undefined,
    );
}

const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'HANDED_OVER',
  'SHIPPING',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'CANCELLED',
] as const;
const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'HIDDEN', 'DISCONTINUED'] as const;

export const idParamsSchema = z.object({ id: objectId });
export const variantParamsSchema = z.object({ variantId: objectId });

export const overviewQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'month']).default('30d'),
});

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvEnum(ORDER_STATUSES),
  delivery: z.enum(['FLEET', 'PARTNER']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['createdAt', '-createdAt', 'totalAmount', '-totalAmount']).default('-createdAt'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const bulkIdsSchema = z.object({
  ids: z.array(objectId).min(1, 'Chọn ít nhất một mục').max(100),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(5, 'Lý do hủy tối thiểu 5 ký tự').max(500),
});

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvEnum(PRODUCT_STATUSES),
  categoryId: objectId.optional(),
  roomId: objectId.optional(),
  stock: z.enum(['OK', 'LOW', 'OUT']).optional(),
  sort: z.enum(['name', '-updatedAt', 'price', '-price', 'stock']).default('-updatedAt'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productStatusSchema = z.object({ status: z.enum(PRODUCT_STATUSES) });

export const bulkProductStatusSchema = bulkIdsSchema.extend({ status: z.enum(PRODUCT_STATUSES) });

export const stockAdjustSchema = z
  .object({
    changeType: z.enum(['IMPORT', 'STOCKTAKE', 'ADJUSTMENT']),
    quantity: z.number().int(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((body) => body.changeType === 'ADJUSTMENT' || body.quantity >= 0, {
    message: 'Số lượng không được âm',
    path: ['quantity'],
  })
  .refine((body) => body.changeType !== 'IMPORT' || body.quantity > 0, {
    message: 'Số lượng nhập phải lớn hơn 0',
    path: ['quantity'],
  });

export const bulkImportSchema = z.object({
  items: z
    .array(z.object({ variantId: objectId, quantity: z.number().int().min(1).max(10_000) }))
    .min(1, 'Nhập số lượng cho ít nhất một biến thể')
    .max(200),
  note: z.string().trim().max(300).optional(),
});

// --- Tạo / sửa sản phẩm (PA-04, PA-05) ---
const money = z.number().int('Giá phải là số nguyên').min(0).max(10_000_000_000);
const size = z.number().positive('Kích thước phải lớn hơn 0').max(10_000);

const packageSchema = z.object({
  name: z.string().trim().max(100).optional(),
  length: size,
  width: size,
  height: size,
  weight: z.number().min(0).max(5_000),
});

const variantInputSchema = z
  .object({
    id: objectId.optional(),
    color: z.string().trim().min(1, 'Nhập màu').max(60),
    material: z.string().trim().max(100).default(''),
    dimensions: z.object({ length: size, width: size, height: size }),
    weight: z.number().min(0).max(5_000),
    originalPrice: money,
    salePrice: money.refine((v) => v > 0, 'Giá bán phải lớn hơn 0'),
    stockQuantity: z.number().int().min(0).max(100_000).default(0),
    lowStockThreshold: z.number().int().min(0).max(100_000),
    shippingTier: z.number().int().min(1).max(4),
    installationService: z.enum(['NONE', 'OPTIONAL', 'REQUIRED']),
    installationFee: money.default(0),
    packages: z.array(packageSchema).max(20).default([]),
    status: z.enum(['ACTIVE', 'DISCONTINUED']).default('ACTIVE'),
  })
  .refine((v) => v.salePrice <= v.originalPrice, {
    message: 'Giá bán không được lớn hơn giá gốc',
    path: ['salePrice'],
  })
  .refine((v) => v.installationService === 'NONE' || v.shippingTier >= 3, {
    message: 'Chỉ biến thể cấp 3–4 mới có dịch vụ lắp đặt',
    path: ['installationService'],
  })
  .refine((v) => v.installationService === 'NONE' || v.installationFee > 0, {
    message: 'Nhập phí lắp đặt',
    path: ['installationFee'],
  });

export const productInputSchema = z.object({
  name: z.string().trim().min(3, 'Tên tối thiểu 3 ký tự').max(150),
  skuRange: z.string().regex(/^\d{3}$/, 'Dãy SKU gồm đúng 3 chữ số').optional(),
  shortDescription: z.string().trim().max(500).default(''),
  description: z.string().trim().max(20_000).default(''),
  searchKeywords: z.string().trim().max(500).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  categoryIds: z.array(objectId).min(1, 'Chọn ít nhất một danh mục').max(20),
  seo: z
    .object({ title: z.string().trim().max(70).default(''), description: z.string().trim().max(170).default('') })
    .default({ title: '', description: '' }),
  warrantyMonths: z.number().int().min(0).max(120),
  warrantyTerms: z.string().trim().max(5_000).default(''),
  parts: z
    .array(
      z.object({
        id: objectId.optional(),
        name: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(999),
        isDetachable: z.boolean().default(false),
      }),
    )
    .max(50)
    .default([]),
  media: z
    .array(z.object({ url: z.string().trim().min(1).max(1_000), type: z.enum(['IMAGE', 'MODEL_3D']) }))
    .max(30)
    .default([]),
  variants: z.array(variantInputSchema).min(1, 'Cần ít nhất một biến thể').max(99),
});

export type ProductInput = z.infer<typeof productInputSchema>;
