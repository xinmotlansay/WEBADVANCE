import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  CartApiService,
  type AddCartItemRequest,
  type Cart,
  type UpdateCartItemRequest,
  type VoucherCheckResult,
} from 'shared';
import { firstValueFrom, type Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Giỏ hàng dùng chung cho header (badge), popup chọn biến thể và trang giỏ.
 * Mọi thao tác thay toàn bộ giỏ bằng response của server; lỗi ném ra để nơi gọi báo cho khách.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly api = inject(CartApiService);
  private readonly auth = inject(AuthService);
  /** So theo id (không theo object) để mỗi lần refresh token không làm tải lại giỏ. */
  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  readonly cart = signal<Cart | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** BR-C09: badge là số dòng trong giỏ. */
  readonly count = computed(() => this.cart()?.items.length ?? 0);
  readonly badge = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
  readonly label = computed(() =>
    this.count() > 0 ? `Giỏ hàng, ${this.count()} sản phẩm` : 'Giỏ hàng',
  );

  constructor() {
    // Đăng nhập, đăng xuất hoặc đổi tài khoản: bỏ giỏ cũ để badge không hiện giỏ của người trước.
    effect(() => {
      this.userId();
      untracked(() => {
        this.cart.set(null);
        this.status.set('idle');
        this.ensureLoaded();
      });
    });
  }

  load(): void {
    // Giỏ hàng cần đăng nhập: khách gọi API sẽ nhận 401 và bị interceptor đẩy sang trang đăng nhập.
    if (!this.auth.isAuthenticated()) return;
    this.status.set('loading');
    this.api.get().subscribe({
      next: (cart) => {
        this.cart.set(cart);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  /** Tải lần đầu nếu chưa có dữ liệu (header gọi khi khởi động). */
  ensureLoaded(): void {
    if (this.status() === 'idle') this.load();
  }

  add(body: AddCartItemRequest): Promise<Cart> {
    return this.apply(this.api.addItem(body));
  }

  update(itemId: string, body: UpdateCartItemRequest): Promise<Cart> {
    return this.apply(this.api.updateItem(itemId, body));
  }

  remove(itemId: string): Promise<Cart> {
    return this.apply(this.api.removeItem(itemId));
  }

  setSelection(isSelected: boolean, itemIds?: string[]): Promise<Cart> {
    return this.apply(this.api.setSelection(isSelected, itemIds));
  }

  /**
   * FR-30: áp voucher bằng mã. Luôn trả kết quả kiểm tra; hợp lệ thì tải lại giỏ để có giảm giá mới
   * (không đổi `status` nên trang không nháy về khung chờ).
   */
  async applyVoucher(code: string): Promise<VoucherCheckResult> {
    const result = await firstValueFrom(this.api.applyVoucher({ code }));
    if (result.valid) this.cart.set(await firstValueFrom(this.api.get()));
    return result;
  }

  removeVoucher(): Promise<Cart> {
    return this.apply(this.api.removeVoucher());
  }

  private async apply(request: Observable<Cart>): Promise<Cart> {
    const cart = await firstValueFrom(request);
    this.cart.set(cart);
    this.status.set('ready');
    return cart;
  }
}
