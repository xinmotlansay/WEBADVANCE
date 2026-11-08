import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Họ và tên không được để trống').max(120),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable(),
    dateOfBirth: z.iso.date('Ngày sinh không hợp lệ').nullable(),
    avatar: z.string().trim().max(500).optional(),
  })
  .partial();

export const deleteRequestSchema = z.object({
  password: z.string().max(128).optional(),
  otpId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
});

/** API Design 2.2: đổi hoặc bổ sung email/SĐT, cần OTP `CHANGE_CONTACT` đã verify gửi tới `target`. */
export const changeContactSchema = z
  .object({
    channel: z.enum(['EMAIL', 'PHONE']),
    target: z.string().trim().min(1),
    otpId: z.string().regex(/^[0-9a-f]{24}$/i, 'Mã xác thực không hợp lệ'),
  })
  .superRefine((value, ctx) => {
    const ok =
      value.channel === 'EMAIL'
        ? z.email().safeParse(value.target).success
        : /^(0|\+84)\d{9}$/.test(value.target.replace(/[\s.-]/g, ''));
    if (!ok) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Thông tin liên hệ không hợp lệ' });
  });

export const wishlistAddSchema = z.object({
  productId: z.string().regex(/^[0-9a-f]{24}$/i, 'Mã sản phẩm không hợp lệ'),
});

const dimension = z.number().min(1).max(2000);

/** API Design 2.5: danh sách lối đi; chỉ `ELEVATOR` mới có `cabin*` và `loadCapacityKg`. */
export const walkwayProfileSchema = z.object({
  name: z.string().trim().min(1, 'Tên hồ sơ không được để trống').max(60),
  address: z.string().trim().max(200).optional(),
  isDefault: z.boolean().default(false),
  passages: z
    .array(
      z.object({
        type: z.enum(['DOOR', 'ELEVATOR', 'STAIRS', 'HALLWAY']),
        label: z.string().trim().max(50).optional(),
        width: dimension.optional(),
        height: dimension.optional(),
        length: dimension.optional(),
        cabinLength: dimension.optional(),
        cabinWidth: dimension.optional(),
        cabinHeight: dimension.optional(),
        loadCapacityKg: z.number().positive().max(10000).optional(),
      }),
    )
    .max(10),
});

export type ChangeContactBody = z.infer<typeof changeContactSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type WalkwayProfileBody = z.infer<typeof walkwayProfileSchema>;

/** Ưu đãi khách mới: hoàn thiện hồ sơ để nhận mã NEW11 qua email. */
export const claimWelcomeOfferSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ và tên tối thiểu 2 ký tự').max(120),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.iso.date('Ngày sinh không hợp lệ'),
  /** Chỉ cần khi tài khoản đăng ký bằng SĐT và chưa có email để nhận mã. */
  email: z.email('Email không hợp lệ').optional(),
  /** Chỉ cần khi tài khoản đăng ký bằng email và chưa có SĐT (dùng cho địa chỉ nhận hàng). */
  phoneNumber: z
    .string()
    .trim()
    .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ')
    .optional(),
  addressLine: z.string().trim().min(1, 'Nhập địa chỉ').max(200),
  ward: z.string().trim().min(1, 'Nhập phường/xã').max(100),
  district: z.string().trim().min(1, 'Nhập quận/huyện').max(100),
  province: z.string().trim().min(1, 'Nhập tỉnh/thành phố').max(100),
});

export const confirmWelcomeOfferSchema = z.object({ token: z.string().min(10).max(2000) });

export type ClaimWelcomeOfferBody = z.infer<typeof claimWelcomeOfferSchema>;
