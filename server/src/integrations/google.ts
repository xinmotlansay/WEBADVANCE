import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

export interface GoogleProfile {
  /** Google account ID, stable across OAuth client changes. */
  googleId: string;
  email: string;
  fullName: string;
  avatar: string;
}

const googleOAuthClient = new OAuth2Client();

/**
 * Xác minh ID token do Google Identity Services cấp ở phía trình duyệt.
 * Kiểm tra chữ ký, thời hạn và audience theo Google OAuth Client ID đã cấu hình.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!config.googleClientId) {
    throw new AppError(
      'GOOGLE_LOGIN_NOT_CONFIGURED',
      500,
      'Hệ thống chưa cấu hình Google OAuth Client ID',
    );
  }

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    const decoded = ticket.getPayload();

    if (!decoded?.sub || !decoded.email) {
      throw new AppError(
        'GOOGLE_EMAIL_MISSING',
        401,
        'Tài khoản Google không cung cấp thông tin email hợp lệ',
      );
    }

    if (decoded.email_verified !== true) {
      throw new AppError('GOOGLE_EMAIL_NOT_VERIFIED', 401, 'Email Google chưa được xác minh');
    }

    return {
      googleId: decoded.sub,
      email: decoded.email.toLowerCase(),
      fullName: (decoded.name || decoded.email.split('@')[0] || 'Khách hàng').trim(),
      avatar: decoded.picture || '',
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    logger.warn({ err: error }, 'Xác minh Google ID token thất bại');
    throw new AppError(
      'GOOGLE_INVALID_TOKEN',
      401,
      'Mã xác thực Google không hợp lệ hoặc đã hết hạn, vui lòng thử lại',
    );
  }
}
