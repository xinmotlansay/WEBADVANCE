import { z } from 'zod';
import { createAddressSchema } from '../addresses/address.schema.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Mã không hợp lệ');
const text = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max);

const buyNowLine = z.object({
  variantId: objectId,
  quantity: z.number().int().min(1, 'Số lượng tối thiểu là 1').max(999),
  hasInstallation: z.boolean().default(false),
});

/** Phần chung của `POST /checkout/preview` và `POST /orders` (API Design 8.2, 8.3). */
const checkoutBase = z.object({
  source: z.enum(['CART', 'BUY_NOW']),
  /** Chỉ dùng với `BUY_NOW`; `CART` lấy các dòng đang chọn trong giỏ. */
  items: z.array(buyNowLine).max(50).nullish(),
  addressId: objectId.nullish(),
  newAddress: createAddressSchema
    .omit({ isDefault: true })
    .extend({ saveAddress: z.boolean().default(false) })
    .nullish(),
  delivery: z
    .object({
      scheduledDate: z.iso.date('Ngày hẹn không hợp lệ'),
      scheduledSlot: z.enum(['MORNING', 'AFTERNOON']),
    })
    .nullish(),
});

function checkSource(body: z.infer<typeof checkoutBase>, ctx: z.RefinementCtx): void {
  if (body.source !== 'BUY_NOW') return;
  const ids = (body.items ?? []).map((i) => i.variantId);
  if (ids.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'Chưa có sản phẩm để mua' });
  } else if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'Biến thể bị lặp' });
  }
}

const invoiceInfo = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('NONE') }),
    z.object({
      type: z.literal('PERSONAL'),
      buyerName: text(200),
      taxCode: z
        .string()
        .regex(/^(\d{10}|\d{12})$/, 'Mã số thuế hoặc CCCD gồm 10 hoặc 12 số')
        .optional(),
      address: text(300),
      sendEmail: z.boolean().default(false),
      email: z.email('Email không hợp lệ').optional(),
    }),
    z.object({
      type: z.literal('COMPANY'),
      buyerName: text(200),
      taxCode: z.string().regex(/^\d{10}(-\d{3})?$/, 'Mã số thuế không hợp lệ'),
      address: text(300),
      sendEmail: z.boolean().default(false),
      email: z.email('Email không hợp lệ').optional(),
    }),
  ])
  .refine((i) => i.type === 'NONE' || !i.sendEmail || !!i.email, {
    path: ['email'],
    message: 'Cần email để nhận hóa đơn',
  });

export const checkoutPreviewSchema = checkoutBase.superRefine(checkSource);

export const createOrderSchema = checkoutBase
  .extend({
    note: z.string().trim().max(500).optional(),
    payment: z.object({
      method: z.enum(['COD', 'BANK_TRANSFER']),
      collectionType: z.enum(['FULL', 'DEPOSIT']).default('FULL'),
    }),
    invoiceInfo: invoiceInfo.default({ type: 'NONE' }),
    expectedTotal: z.number().int().min(0),
  })
  .superRefine(checkSource);

/** Header `Idempotency-Key` (UUID do client sinh một lần khi vào trang thanh toán). */
export const idempotencyKeySchema = z.string().trim().min(8).max(100);

export type CheckoutBody = z.infer<typeof checkoutPreviewSchema>;
export type CreateOrderBody = z.infer<typeof createOrderSchema>;
