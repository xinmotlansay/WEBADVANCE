import { Injectable } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  type Auth,
  type UserCredential,
} from 'firebase/auth';
import { firebaseConfig } from './firebase.config';

/** Lỗi hiển thị được cho người dùng (message đã là tiếng Việt). */
export class GoogleAuthError extends Error {}

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  // Khách chủ động đóng popup: không phải lỗi, chuỗi rỗng để giao diện bỏ qua.
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/popup-blocked':
    'Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép popup rồi thử lại.',
  'auth/unauthorized-domain':
    'Tên miền này chưa được cấp phép trong Firebase. Vui lòng thêm localhost vào Authorized domains.',
  'auth/operation-not-allowed':
    'Đăng nhập Google chưa được bật trong Firebase. Vui lòng bật provider Google.',
  'auth/network-request-failed': 'Không kết nối được tới Google, vui lòng kiểm tra mạng.',
  'auth/account-exists-with-different-credential':
    'Email này đã được dùng với cách đăng nhập khác.',
};

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;

  readonly isConfigured = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
  );

  /** Mở popup đăng nhập Google và trả về Firebase ID token để backend xác minh. */
  async signIn(): Promise<string> {
    const credential = await this.openPopup();
    return credential.user.getIdToken();
  }

  private async openPopup(): Promise<UserCredential> {
    if (!this.isConfigured) {
      throw new GoogleAuthError(
        'Chưa cấu hình Firebase cho trang khách hàng. Vui lòng điền firebase.config.ts.',
      );
    }

    try {
      return await signInWithPopup(this.getAuth(), new GoogleAuthProvider());
    } catch (error) {
      throw new GoogleAuthError(this.toMessage(error));
    }
  }

  private getAuth(): Auth {
    if (this.auth) {
      return this.auth;
    }

    this.app = getApps()[0] ?? initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    return this.auth;
  }

  private toMessage(error: unknown): string {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    return FIREBASE_ERROR_MESSAGES[code] ?? 'Đăng nhập Google thất bại, vui lòng thử lại.';
  }
}
