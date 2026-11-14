import { Injectable } from '@angular/core';
import { googleOAuthConfig } from '../../core/auth/google-oauth.config';

export class GoogleAuthError extends Error {}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme: 'outline';
      size: 'large';
      text: 'signin_with' | 'signup_with';
      shape: 'rectangular';
      logo_alignment: 'left';
      width: number;
      locale: 'vi';
    },
  ): void;
}

interface GoogleNamespace {
  accounts: {
    id: GoogleIdentityApi;
  };
}

type WindowWithGoogle = Window & { google?: GoogleNamespace };

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

function getGoogleIdentityApi(): GoogleIdentityApi | null {
  return (window as WindowWithGoogle).google?.accounts?.id ?? null;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private scriptPromise: Promise<GoogleIdentityApi> | null = null;

  async renderButton(
    container: HTMLElement,
    label: string,
    onCredential: (idToken: string) => void,
    onError: (message: string) => void,
  ): Promise<void> {
    if (!googleOAuthConfig.clientId) {
      throw new GoogleAuthError('Chưa cấu hình Google OAuth Client ID cho trang khách hàng.');
    }

    const google = await this.loadGoogleIdentityApi();
    google.initialize({
      client_id: googleOAuthConfig.clientId,
      callback: (response) => {
        if (!response.credential) {
          onError('Google không trả về mã xác thực, vui lòng thử lại.');
          return;
        }
        onCredential(response.credential);
      },
    });

    const availableWidth = Math.round(container.getBoundingClientRect().width);
    google.renderButton(container, {
      theme: 'outline',
      size: 'large',
      text: label.includes('Đăng ký') ? 'signup_with' : 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(Math.max(availableWidth, 120), 400),
      locale: 'vi',
    });
  }

  private loadGoogleIdentityApi(): Promise<GoogleIdentityApi> {
    const existing = getGoogleIdentityApi();
    if (existing) {
      return Promise.resolve(existing);
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const google = getGoogleIdentityApi();
        if (!google) {
          this.scriptPromise = null;
          reject(new GoogleAuthError('Không tải được dịch vụ đăng nhập Google, vui lòng thử lại.'));
          return;
        }
        resolve(google);
      };
      script.onerror = () => {
        this.scriptPromise = null;
        reject(new GoogleAuthError('Không kết nối được tới Google, vui lòng kiểm tra mạng.'));
      };
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }
}
