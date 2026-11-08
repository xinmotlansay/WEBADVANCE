import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:mm');

/** Bắt buộc có tọa độ vì bản đồ ở trang chủ khách đặt điểm theo kinh độ, vĩ độ. */
export const showroomSchema = z
  .object({
    name: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự').max(100),
    city: z.string().trim().min(1, 'Nhập tỉnh/thành').max(60),
    region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']),
    address: z.string().trim().min(5, 'Nhập địa chỉ đầy đủ').max(300),
    phone: z.string().trim().max(20).default(''),
    openTime: time,
    closeTime: time,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    image: z.string().trim().max(500).default(''),
    isFlagship: z.boolean().default(false),
    displayOrder: z.number().int().min(0).max(9999).default(0),
    status: z.enum(['VISIBLE', 'HIDDEN']).default('VISIBLE'),
  })
  .refine((s) => s.openTime < s.closeTime, { message: 'Giờ mở cửa phải trước giờ đóng cửa', path: ['closeTime'] });

export type ShowroomInput = z.infer<typeof showroomSchema>;
