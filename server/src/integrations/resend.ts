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
    if (!!config.isProduction) {
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

export interface StockDigestLine {
  name: string;
  sku: string;
  color: string;
  stock: number;
  threshold: number;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * PA-08: email tóm tắt tồn kho hằng ngày cho Product Admin (mẫu email "tóm tắt tồn kho", AD-15).
 * Dev không có RESEND_API_KEY thì chỉ ghi log, giống email OTP.
 */
export async function sendStockDigestEmail(to: string, day: string, lines: StockDigestLine[]): Promise<void> {
  const dateLabel = day.split('-').reverse().join('/');
  const out = lines.filter((l) => l.stock === 0).length;
  if (!config.resendApiKey) {
    logger.warn({ to, day, low: lines.length - out, out }, 'Email tóm tắt tồn kho (dev, chưa cấu hình Resend)');
    return;
  }
  const rows = lines
    .map(
      (l) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e3eaf2">${escapeHtml(l.name)}${l.color ? ` · ${escapeHtml(l.color)}` : ''}</td>
          <td style="padding:8px;border-bottom:1px solid #e3eaf2;font-family:monospace">${escapeHtml(l.sku)}</td>
          <td style="padding:8px;border-bottom:1px solid #e3eaf2;text-align:right;color:${l.stock === 0 ? '#9b1c1c' : '#8a4b00'}">
            ${l.stock}/${l.threshold}
          </td>
        </tr>`,
    )
    .join('');
  const response = await getClient().emails.send({
    from: config.otpEmailFrom,
    to,
    subject: `[CaraVeso] Tóm tắt tồn kho ${dateLabel}: ${lines.length - out} sắp hết, ${out} hết hàng`,
    html: `
      <div style="margin:0;padding:32px 16px;background:#f7fafc;font-family:Arial,Helvetica,sans-serif;color:#0b3056">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px">
          <h2 style="margin:0 0 8px;font-size:20px">Tóm tắt tồn kho ${dateLabel}</h2>
          <p style="margin:0 0 20px;color:#5a6f84;font-size:14px">
            ${lines.length - out} biến thể dưới ngưỡng cảnh báo và ${out} biến thể hết hàng.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="color:#5a6f84;text-align:left">
                <th style="padding:8px">Sản phẩm</th><th style="padding:8px">SKU</th><th style="padding:8px;text-align:right">Tồn/ngưỡng</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `,
  });
  if (response.error) {
    logger.error({ err: response.error, to }, 'Resend từ chối gửi email tóm tắt tồn kho');
    return;
  }
  logger.info({ to, day, emailId: response.data?.id }, 'Đã gửi email tóm tắt tồn kho');
}
