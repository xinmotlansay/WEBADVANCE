import { z } from 'zod';
import { isStrongPassword } from './auth.rules.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Mã định danh không hợp lệ');
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ (ví dụ: 0901234567)');

const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .refine(isStrongPassword, 'Mật khẩu phải gồm chữ cái, chữ số và ký tự đặc biệt');

const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải có định dạng YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày sinh không hợp lệ')
  .refine((value) => Date.parse(value) <= Date.now(), 'Ngày sinh không được ở tương lai');

export const otpSendSchema = z
  .object({
    purpose: z.enum(['REGISTER', 'FORGOT_PASSWORD', 'CHANGE_CONTACT', 'DELETE_ACCOUNT']),
    channel: z.enum(['EMAIL', 'PHONE']),
    target: z.string().trim().min(1, 'Vui lòng nhập email hoặc số điện thoại'),
  })
  .superRefine((value, ctx) => {
    if (value.channel === 'EMAIL' && !z.email().safeParse(value.target).success) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'Email không hợp lệ' });
    }
    if (value.channel === 'PHONE' && !phoneSchema.safeParse(value.target).success) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'Số điện thoại không hợp lệ' });
    }
  });

export const otpVerifySchema = z.object({
  otpId: objectIdSchema,
  code: z.string().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số'),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Họ tên tối thiểu 2 ký tự')
      .max(100, 'Họ tên tối đa 100 ký tự'),
    dateOfBirth: dateOfBirthSchema.nullish(),
    email: z.email('Email không hợp lệ').nullish(),
    phoneNumber: phoneSchema.nullish(),
    password: passwordSchema,
    termsAccepted: z.boolean().refine((value) => value === true, {
      message: 'Bạn phải đồng ý với điều khoản dịch vụ',
    }),
    otpId: objectIdSchema,
  })
  .refine((value) => Boolean(value.email) !== Boolean(value.phoneNumber), {
    message: 'Chỉ chọn một trong hai: email hoặc số điện thoại',
    path: ['email'],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Vui lòng nhập email hoặc số điện thoại').max(100),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(72),
});

export const resetPasswordSchema = z.object({
  otpId: objectIdSchema,
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export const googleLoginSchema = z.object({
  idToken: z
    .string({ error: 'Thiếu mã xác thực Google' })
    .trim()
    .min(20, 'Mã xác thực Google không hợp lệ')
    .max(4096),
});

const linkTokenSchema = z
  .string({ error: 'Thiếu phiên liên kết Google' })
  .trim()
  .min(20, 'Phiên liên kết không hợp lệ');

export const googleLinkOtpSchema = z.object({
  linkToken: linkTokenSchema,
});

export const googleLinkSchema = z
  .object({
    linkToken: linkTokenSchema,
    password: z.string().max(72, 'Mật khẩu tối đa 72 ký tự').optional(),
    otpId: objectIdSchema.optional(),
  })
  .refine((value) => Boolean(value.password) !== Boolean(value.otpId), {
    message: 'Chọn một trong hai cách xác minh: mật khẩu hoặc mã gửi tới email',
    path: ['password'],
  });

export type OtpVerifyBody = z.infer<typeof otpVerifySchema>;
export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type GoogleLoginBody = z.infer<typeof googleLoginSchema>;
export type GoogleLinkOtpBody = z.infer<typeof googleLinkOtpSchema>;
export type GoogleLinkBody = z.infer<typeof googleLinkSchema>;
