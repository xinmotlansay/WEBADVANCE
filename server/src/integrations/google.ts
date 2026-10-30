import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

export interface GoogleProfile {
  /** ID người dùng Google (ổn định, không phụ thuộc project Firebase). */
  googleId: string;
  email: string;
  fullName: string;
  avatar: string;
}

interface FirebaseContext {
  app: App;
  /** Có service account thì mới kiểm tra được token đã bị thu hồi (checkRevoked). */
  canCheckRevoked: boolean;
}

function buildContext(): FirebaseContext {
  const existing = getApps()[0];
  if (existing) {
    return { app: existing, canCheckRevoked: hasServiceAccount() };
  }

  const projectId = config.firebaseProjectId;
  const clientEmail = config.firebaseClientEmail;
  const privateKey = config.firebasePrivateKey?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return {
      app: initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }),
      canCheckRevoked: true,
    };
  }

  if (config.googleApplicationCredentials) {
    return {
      app: initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) }),
      canCheckRevoked: true,
    };
  }

  // Chỉ có projectId vẫn verify được ID token: Firebase Admin tải public key từ Google.
  // Khi dùng cách này thì không gọi được API quản trị (vd: kiểm tra token bị thu hồi).
  if (projectId) {
    return { app: initializeApp({ projectId }), canCheckRevoked: false };
  }

  throw new AppError(
    'GOOGLE_LOGIN_NOT_CONFIGURED',
    500,
    'Hệ thống chưa cấu hình đăng nhập bằng Google',
  );
}

function hasServiceAccount(): boolean {
  return Boolean(
    config.firebaseClientEmail &&
      config.firebasePrivateKey &&
      config.firebaseProjectId,
  ) || Boolean(config.googleApplicationCredentials);
}

/**
 * Xác minh ID token do Firebase Auth (provider Google) cấp ở phía trình duyệt.
 * Kiểm tra: chữ ký hợp lệ, còn hạn, đúng project, và thực sự đến từ provider Google.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<GoogleProfile> {
  try {
    const { app, canCheckRevoked } = buildContext();
    const decoded = await getAuth(app)
      .verifyIdToken(idToken, canCheckRevoked)
      .catch((error: { code?: string }) => {
        // Service account thiếu quyền Firebase Auth: vẫn kiểm chữ ký/hạn/project, chỉ bỏ bước kiểm tra thu hồi.
        if (error.code !== 'auth/insufficient-permission') throw error;
        logger.warn('Service account thiếu quyền Firebase Authentication Admin, bỏ qua kiểm tra token bị thu hồi');
        return getAuth(app).verifyIdToken(idToken, false);
      });

    if (decoded.firebase?.sign_in_provider !== 'google.com') {
      throw new AppError(
        'GOOGLE_INVALID_TOKEN',
        401,
        'Mã xác thực Google không hợp lệ, vui lòng thử lại',
      );
    }

    if (!decoded.email) {
      throw new AppError(
        'GOOGLE_EMAIL_MISSING',
        401,
        'Tài khoản Google không cung cấp email, vui lòng dùng cách đăng nhập khác',
      );
    }

    if (decoded.email_verified === false) {
      throw new AppError('GOOGLE_EMAIL_NOT_VERIFIED', 401, 'Email Google chưa được xác minh');
    }

    const googleId = decoded.firebase?.identities?.['google.com']?.[0] ?? decoded.uid;

    return {
      googleId,
      email: decoded.email.toLowerCase(),
      fullName: (decoded.name || decoded.email.split('@')[0] || 'Khách hàng').trim(),
      avatar: decoded.picture ?? '',
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    logger.warn({ err: error }, 'Xác minh Firebase ID token thất bại');
    throw new AppError(
      'GOOGLE_INVALID_TOKEN',
      401,
      'Mã xác thực Google không hợp lệ hoặc đã hết hạn, vui lòng thử lại',
    );
  }
}
