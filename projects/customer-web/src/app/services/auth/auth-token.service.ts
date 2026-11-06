import { Injectable, computed, signal } from '@angular/core';

/**
 * Access token của phiên đăng nhập. Chức năng đăng nhập chưa có nên hiện luôn là `null`,
 * khi làm xong module auth thì gán token vào đây.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  readonly accessToken = signal<string | null>(null);
  readonly isLoggedIn = computed(() => this.accessToken() !== null);
}
