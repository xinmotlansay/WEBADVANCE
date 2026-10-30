import { Resend } from 'resend';
import { AppError } from '../lib/app-error.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

let client: Resend | null = null;

function getClient(): Resend {
  client ??= new Resend(config.resendApiKey);
  return client;
}

const SUBJECT_BY_PURPOSE: Record<string, string> = {
  REGISTER: 'Mã xác thực đăng ký tài khoản CaraVeso',
  FORGOT_PASSWORD: 'Mã đặt lại mật khẩu CaraVeso',
  LINK_GOOGLE: 'Mã liên kết tài khoản Google CaraVeso',
  CHANGE_CONTACT: 'Mã xác thực thay đổi thông tin liên hệ CaraVeso',
  DELETE_ACCOUNT: 'Mã xác thực xóa tài khoản CaraVeso',
};

/**
 * Gửi OTP qua email bằng Resend.
 * Ở môi trường dev không có RESEND_API_KEY thì ghi mã ra log để test
 * (cùng cách xử lý với OTP số điện thoại mô phỏng theo docs/architecture.md 5.3).
 */
export async function sendOtpEmail(to: string, code: string, purpose: string): Promise<void> {
  if (!config.resendApiKey) {
    if (config.isProduction) {
      throw new AppError(
        'EMAIL_NOT_CONFIGURED',
        500,
        'Hệ thống chưa cấu hình dịch vụ gửi email xác thực',
      );
    }
    // Đặt tên `otp` (không phải `code`) vì logger che trường `code`; ở dev cần đọc mã này để đăng ký.
    logger.warn({ to, otp: code, purpose }, 'OTP email (dev, chưa cấu hình Resend)');
    return;
  }

  const subject = SUBJECT_BY_PURPOSE[purpose] ?? 'Mã xác thực CaraVeso';
  const response = await getClient().emails.send({
    from: config.otpEmailFrom,
    to,
    subject,
    html: `
      <div style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h2 style="margin:0 0 16px;color:#0e2a47;font-size:22px">CaraVeso</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px">Xin chào,</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px">
            Mã xác thực của bạn là:
          </p>
          <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:10px;color:#0e2a47;text-align:center">
            ${code}
          </p>
          <p style="margin:0 0 8px;color:#374151;font-size:14px">
            Mã có hiệu lực trong <strong>5 phút</strong> và chỉ dùng được một lần.
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">
            Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Không chia sẻ mã cho bất kỳ ai.
          </p>
        </div>
        <p style="max-width:480px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center">
          Email tự động từ CaraVeso, vui lòng không trả lời.
        </p>
      </div>
    `,
  });

  if (response.error) {
    logger.error(
      { err: response.error, to, purpose },
      'Resend từ chối gửi email OTP',
    );
    throw new AppError(
      'EMAIL_SEND_FAILED',
      502,
      'Không gửi được email xác thực, vui lòng thử lại sau ít phút',
    );
  }

  logger.info({ to, purpose, emailId: response.data?.id }, 'Đã gửi mã xác thực qua email');
}
