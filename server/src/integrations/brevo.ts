import { AppError } from '../lib/app-error.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 15_000;

interface BrevoSender {
  name?: string;
  email: string;
}

interface SendResult {
  messageId?: string;
  error?: { status?: number; message: string };
}

/**
 * Tách `OTP_EMAIL_FROM` dạng "Tên <email@domain>" hoặc "email@domain" thành sender của Brevo.
 * Sender phải là địa chỉ đã xác thực trong tài khoản Brevo.
 */
export function parseSender(from: string): BrevoSender {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (match) {
    return { name: match[1] || undefined, email: match[2]!.trim() };
  }
  return { email: from.trim() };
}

/** Gọi API gửi email giao dịch của Brevo. Không ném lỗi mạng, trả về `error` để hàm gọi tự xử lý. */
async function sendBrevoEmail(payload: {
  to: string;
  subject: string;
  html: string;
  /** File đính kèm, nội dung base64. */
  attachments?: { name: string; content: string }[];
}): Promise<SendResult> {
  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': config.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseSender(config.otpEmailFrom),
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        ...(payload.attachments?.length ? { attachment: payload.attachments } : {}),
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string };

    if (!response.ok) {
      return { error: { status: response.status, message: body.message ?? response.statusText } };
    }
    return { messageId: body.messageId };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

const SUBJECT_BY_PURPOSE: Record<string, string> = {
  REGISTER: 'Mã xác thực đăng ký tài khoản CaraVeso',
  FORGOT_PASSWORD: 'Mã đặt lại mật khẩu CaraVeso',
  LINK_GOOGLE: 'Mã liên kết tài khoản Google CaraVeso',
  CHANGE_CONTACT: 'Mã xác thực thay đổi thông tin liên hệ CaraVeso',
  DELETE_ACCOUNT: 'Mã xác thực xóa tài khoản CaraVeso',
};

/**
 * Gửi OTP qua email bằng Brevo.
 * Ở môi trường dev không có BREVO_API_KEY thì ghi mã ra log để test
 * (cùng cách xử lý với OTP số điện thoại mô phỏng theo docs/architecture.md 5.3).
 */
export async function sendOtpEmail(to: string, code: string, purpose: string): Promise<void> {
  if (!config.brevoApiKey) {
    if (config.isProduction) {
      throw new AppError(
        'EMAIL_NOT_CONFIGURED',
        500,
        'Hệ thống chưa cấu hình dịch vụ gửi email xác thực',
      );
    }
    // Đặt tên `otp` (không phải `code`) vì logger che trường `code`; ở dev cần đọc mã này để đăng ký.
    logger.warn({ to, otp: code, purpose }, 'OTP email (dev, chưa cấu hình Brevo)');
    return;
  }

  const subject = SUBJECT_BY_PURPOSE[purpose] ?? 'Mã xác thực CaraVeso';
  const response = await sendBrevoEmail({
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
      'Brevo từ chối gửi email OTP',
    );
    throw new AppError(
      'EMAIL_SEND_FAILED',
      502,
      'Không gửi được email xác thực, vui lòng thử lại sau ít phút',
    );
  }

  logger.info({ to, purpose, emailId: response.messageId }, 'Đã gửi mã xác thực qua email');
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
 * Dev không có BREVO_API_KEY thì chỉ ghi log, giống email OTP.
 */
export async function sendStockDigestEmail(to: string, day: string, lines: StockDigestLine[]): Promise<void> {
  const dateLabel = day.split('-').reverse().join('/');
  const out = lines.filter((l) => l.stock === 0).length;
  if (!config.brevoApiKey) {
    logger.warn({ to, day, low: lines.length - out, out }, 'Email tóm tắt tồn kho (dev, chưa cấu hình Brevo)');
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
  const response = await sendBrevoEmail({
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
    logger.error({ err: response.error, to }, 'Brevo từ chối gửi email tóm tắt tồn kho');
    return;
  }
  logger.info({ to, day, emailId: response.messageId }, 'Đã gửi email tóm tắt tồn kho');
}

/**
 * AD-11: gửi liên kết đặt mật khẩu cho Admin mới. Dev chưa cấu hình Brevo thì ghi liên kết ra log.
 */
export async function sendAdminInviteEmail(
  to: string,
  fullName: string,
  link: string,
  expiresInHours: number,
): Promise<void> {
  if (!config.brevoApiKey) {
    if (config.isProduction) {
      throw new AppError('EMAIL_NOT_CONFIGURED', 500, 'Hệ thống chưa cấu hình dịch vụ gửi email');
    }
    logger.warn({ to, link }, 'Liên kết đặt mật khẩu Admin (dev, chưa cấu hình Brevo)');
    return;
  }

  const response = await sendBrevoEmail({
    to,
    subject: 'Đặt mật khẩu tài khoản quản trị CaraVeso',
    html: `
      <div style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h2 style="margin:0 0 16px;color:#0e2a47;font-size:22px">CaraVeso</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px">Xin chào ${escapeHtml(fullName)},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px">
            Bạn được cấp tài khoản quản trị CaraVeso. Bấm nút dưới đây để đặt mật khẩu (tối thiểu 12 ký tự).
          </p>
          <p style="margin:0 0 20px;text-align:center">
            <a href="${link}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:#0b3056;color:#ffffff;text-decoration:none;font-weight:600">Đặt mật khẩu</a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">
            Liên kết có hiệu lực trong ${expiresInHours} giờ và chỉ dùng được một lần.
          </p>
        </div>
      </div>
    `,
  });

  if (response.error) {
    logger.error({ err: response.error, to }, 'Brevo từ chối gửi email đặt mật khẩu Admin');
    throw new AppError('EMAIL_SEND_FAILED', 502, 'Không gửi được email đặt mật khẩu, vui lòng thử lại sau');
  }
}

/** Email tặng mã giảm giá khách mới sau khi hoàn thiện hồ sơ. Dev chưa có Brevo thì ghi log. */
export async function sendWelcomeVoucherEmail(
  to: string,
  fullName: string,
  code: string,
  confirmUrl: string,
): Promise<boolean> {
  if (!config.brevoApiKey) {
    logger.warn({ to, voucher: code, confirmUrl }, 'Email mã khách mới (dev, chưa cấu hình Brevo)');
    return true;
  }
  const response = await sendBrevoEmail({
    to,
    subject: `Quà chào mừng từ CaraVeso: mã ${code} giảm 10%`,
    html: `
      <div style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h2 style="margin:0 0 16px;color:#0e2a47;font-size:22px">CaraVeso</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px">Xin chào ${escapeHtml(fullName)},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px">
            Cảm ơn bạn đã hoàn thiện hồ sơ. Bấm nút dưới đây để nhận mã ưu đãi <strong>giảm 10%</strong>
            cho đơn hàng đầu tiên (mã ${escapeHtml(code)}) vào Ví voucher của bạn.
          </p>
          <p style="margin:0 0 20px;text-align:center">
            <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:#0b3056;color:#ffffff;text-decoration:none;font-weight:600">Xác nhận và nhận voucher</a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">Liên kết có hiệu lực 30 ngày. Hãy đăng nhập đúng tài khoản đã nhận email này.</p>
        </div>
      </div>
    `,
  });
  if (response.error) {
    logger.error({ err: response.error, to }, 'Brevo từ chối gửi email mã khách mới');
    return false;
  }
  logger.info({ to, emailId: response.messageId }, 'Đã gửi email mã khách mới');
  return true;
}

export interface InvoiceEmailInput {
  to: string;
  invoiceNumber: string;
  orderCode: string;
  fileName: string;
  pdf: Buffer;
}

/**
 * Gửi hóa đơn điện tử (PDF đính kèm) cho khách chọn nhận qua email lúc đặt hàng (FR-45).
 * Ném lỗi khi gửi thất bại để job của worker thử lại ở lần quét sau.
 * Dev không có BREVO_API_KEY thì ghi log, giống email OTP.
 */
export async function sendInvoiceEmail(input: InvoiceEmailInput): Promise<void> {
  if (!config.brevoApiKey) {
    if (config.isProduction) {
      throw new AppError('EMAIL_NOT_CONFIGURED', 500, 'Hệ thống chưa cấu hình dịch vụ gửi email');
    }
    logger.warn(
      { to: input.to, invoiceNumber: input.invoiceNumber, orderCode: input.orderCode },
      'Email hóa đơn (dev, chưa cấu hình Brevo)',
    );
    return;
  }

  const response = await sendBrevoEmail({
    to: input.to,
    subject: `Hóa đơn điện tử ${input.invoiceNumber} từ CaraVeso`,
    html: `
      <div style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
          <h2 style="margin:0 0 16px;color:#0e2a47;font-size:22px">CaraVeso</h2>
          <p style="margin:0 0 12px;color:#374151;font-size:15px">Xin chào,</p>
          <p style="margin:0 0 12px;color:#374151;font-size:15px">
            Hóa đơn điện tử cho đơn hàng <strong>${escapeHtml(input.orderCode)}</strong>
            (số <strong>${escapeHtml(input.invoiceNumber)}</strong>) đã được gửi kèm email này dưới dạng file PDF.
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">
            Bạn cũng có thể tải lại hóa đơn trong mục Đơn hàng của tài khoản CaraVeso.
          </p>
        </div>
        <p style="max-width:480px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center">
          Email tự động từ CaraVeso, vui lòng không trả lời.
        </p>
      </div>
    `,
    attachments: [{ name: input.fileName, content: input.pdf.toString('base64') }],
  });

  if (response.error) {
    logger.error({ err: response.error, to: input.to, invoiceNumber: input.invoiceNumber }, 'Brevo từ chối gửi email hóa đơn');
    throw new AppError('EMAIL_SEND_FAILED', 502, 'Không gửi được email hóa đơn');
  }
  logger.info({ to: input.to, invoiceNumber: input.invoiceNumber, emailId: response.messageId }, 'Đã gửi hóa đơn qua email');
}
