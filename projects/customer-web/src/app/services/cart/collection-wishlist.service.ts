import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import type { ApiResponse } from 'shared';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../ui/toast.service';

const GUEST_KEY = 'caraveso.guestWishlist';

const API = '/api/v1/users/me/wishlist';

/**
 * Yêu thích của khách đăng nhập, lưu trên server (FR-09, FR-22). Khách chưa đăng nhập vẫn bấm tim
 * được nhưng danh sách chỉ lưu tạm trong phiên trình duyệt; đăng nhập xong thì gộp vào tài khoản.
 */
@Injectable({ providedIn: 'root' })
export class CollectionWishlistService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Id các sản phẩm đang yêu thích. */
  readonly ids = signal<string[]>([]);

  constructor() {
    this.ids.set(this.readGuest());
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        untracked(() => this.ids.set(this.readGuest()));
        return;
      }
      untracked(() => this.syncAccount());
    });
  }

  toggle(id: string): void {
    if (!this.auth.isAuthenticated()) {
      const added = !this.ids().includes(id);
      this.ids.update((ids) => (added ? [...ids, id] : ids.filter((value) => value !== id)));
      this.writeGuest(this.ids());
      this.toast.success(
        added
          ? 'Đã thêm vào danh sách yêu thích tạm thời. Đăng nhập để lưu lại.'
          : 'Đã bỏ sản phẩm khỏi danh sách yêu thích tạm thời.',
      );
      return;
    }
    const saved = this.ids().includes(id);
    // Cập nhật ngay cho nhanh, lỗi thì trả về như cũ.
    this.ids.update((ids) => (saved ? ids.filter((value) => value !== id) : [...ids, id]));
    this.toast.success(saved ? 'Đã bỏ sản phẩm khỏi danh sách yêu thích.' : 'Đã thêm sản phẩm vào danh sách yêu thích.');
    const request = saved ? this.http.delete(`${API}/${id}`) : this.http.post(API, { productId: id });
    request.subscribe({
      error: () => {
        this.ids.update((ids) => (saved ? [...ids, id] : ids.filter((value) => value !== id)));
        this.toast.error('Không cập nhật được danh sách yêu thích.');
      },
    });
  }

  /** Gộp danh sách tạm của khách vào tài khoản vừa đăng nhập rồi tải danh sách chính thức. */
  private syncAccount(): void {
    const pending = this.readGuest();
    const merge = pending.map((productId) =>
      this.http.post(API, { productId }).pipe(catchError(() => of(null))),
    );
    (merge.length ? forkJoin(merge) : of([])).subscribe(() => {
      if (pending.length) {
        this.writeGuest([]);
        this.toast.success(`Đã lưu ${pending.length} sản phẩm yêu thích vào tài khoản của bạn.`);
      }
      this.http.get<ApiResponse<{ id: string }[]>>(API).subscribe({
        next: (response) => this.ids.set(response.data.map((item) => item.id)),
        error: () => this.ids.set([]),
      });
    });
  }

  private readGuest(): string[] {
    try {
      const raw = sessionStorage.getItem(GUEST_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeGuest(ids: string[]): void {
    try {
      sessionStorage.setItem(GUEST_KEY, JSON.stringify(ids));
    } catch {
      // Không lưu được thì danh sách chỉ còn trong bộ nhớ của trang hiện tại.
    }
  }
}
