import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  otpSendSchema,
  otpVerifySchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schema.js';

const otpId = '507f1f77bcf86cd799439011';

describe('registerSchema', () => {
  const baseInput = {
    fullName: 'Nguyễn Văn An',
    password: 'Abc@1234',
    termsAccepted: true,
    otpId,
  };

  it('chấp nhận đăng ký bằng email đã có OTP', () => {
    expect(registerSchema.safeParse({ ...baseInput, email: 'user@example.com' }).success).toBe(
      true,
    );
  });

  it('chấp nhận đăng ký bằng số điện thoại đã có OTP', () => {
    expect(registerSchema.safeParse({ ...baseInput, phoneNumber: '0901234567' }).success).toBe(
      true,
    );
  });

  it('từ chối khi không chọn email hoặc số điện thoại', () => {
    expect(registerSchema.safeParse(baseInput).success).toBe(false);
  });

  it('từ chối khi chọn đồng thời email và số điện thoại', () => {
    expect(
      registerSchema.safeParse({
        ...baseInput,
        email: 'user@example.com',
        phoneNumber: '0901234567',
      }).success,
    ).toBe(false);
  });

  it('bắt buộc đồng ý điều khoản dịch vụ', () => {
    expect(
      registerSchema.safeParse({
        ...baseInput,
        email: 'user@example.com',
        termsAccepted: false,
      }).success,
    ).toBe(false);
  });

  it.each(['short1@', 'Abcdefg@', '1234567@', 'Abc12345'])(
    'từ chối mật khẩu không đáp ứng yêu cầu tối thiểu: %s',
    (password) => {
      expect(
        registerSchema.safeParse({ ...baseInput, email: 'user@example.com', password }).success,
      ).toBe(false);
    },
  );

  it('từ chối email và số điện thoại sai định dạng', () => {
    expect(registerSchema.safeParse({ ...baseInput, email: 'not-an-email' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...baseInput, phoneNumber: '12345' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it.each(['user@example.com', '0901234567'])(
    'chấp nhận đăng nhập với định danh %s',
    (identifier) => {
      expect(loginSchema.safeParse({ identifier, password: 'any-password' }).success).toBe(true);
    },
  );

  it('từ chối thiếu email/số điện thoại hoặc mật khẩu', () => {
    expect(loginSchema.safeParse({ identifier: '', password: 'any-password' }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'user@example.com', password: '' }).success).toBe(
      false,
    );
  });
});

describe('OTP schemas', () => {
  it('chấp nhận yêu cầu OTP đăng ký và quên mật khẩu qua email hoặc điện thoại', () => {
    expect(
      otpSendSchema.safeParse({
        purpose: 'REGISTER',
        channel: 'EMAIL',
        target: 'user@example.com',
      }).success,
    ).toBe(true);
    expect(
      otpSendSchema.safeParse({
        purpose: 'FORGOT_PASSWORD',
        channel: 'PHONE',
        target: '0901234567',
      }).success,
    ).toBe(true);
  });

  it('từ chối yêu cầu OTP khi kênh không khớp định dạng liên hệ', () => {
    expect(
      otpSendSchema.safeParse({
        purpose: 'REGISTER',
        channel: 'EMAIL',
        target: 'not-an-email',
      }).success,
    ).toBe(false);
    expect(
      otpSendSchema.safeParse({
        purpose: 'FORGOT_PASSWORD',
        channel: 'PHONE',
        target: '12345',
      }).success,
    ).toBe(false);
  });

  it('chỉ chấp nhận mã OTP gồm đúng 6 chữ số', () => {
    expect(otpVerifySchema.safeParse({ otpId, code: '123456' }).success).toBe(true);
    expect(otpVerifySchema.safeParse({ otpId, code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ otpId, code: '12345a' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('chấp nhận mật khẩu mới đáp ứng yêu cầu FR-01', () => {
    expect(resetPasswordSchema.safeParse({ otpId, newPassword: 'Abc@1234' }).success).toBe(true);
  });

  it('từ chối mật khẩu mới không đáp ứng yêu cầu FR-01', () => {
    expect(resetPasswordSchema.safeParse({ otpId, newPassword: 'abcdefgh' }).success).toBe(false);
  });
});
