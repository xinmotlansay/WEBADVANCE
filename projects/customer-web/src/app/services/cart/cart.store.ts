import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  CartApiService,
  type AddCartItemRequest,
  type ApplyVoucherRequest,
  type Cart,
  type GuestCartLine,
  type UpdateCartItemRequest,
  type VoucherCheckResult,
} from 'shared';
import { firstValueFrom, type Observable } from 'rxjs';
import { isBlocking } from '../../features/cart/cart-rules';
import { AuthService } from '../auth/auth.service';

const GUEST_KEY = 'caraveso.guest-cart.v1';
const MAX_LINE_QUANTITY = 999;

const EMPTY_CART: Cart = {
  id: null,
  items: [],
  appliedVoucher: null,
  summary: {
    subtotal: 0,
    promotionDiscount: 0,
    voucherDiscount: 0,
    shippingFee: 0,
    installationFee: 0,
    totalAmount: 0,
  },
};

/** Lỗi cùng dạng server trả để các màn hình đang xử lý `INSUFFICIENT_STOCK`... dùng lại được. */
function guestError(status: number, code: string, message: string, details?: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { error: { code, message, details } } });
}

function readGuestLines(): GuestCartLine[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(
      (l): l is GuestCartLine =>
        !!l &&
        typeof l.variantId === 'string' &&
        /^[0-9a-f]{24}$/i.test(l.variantId) &&
        Number.isInteger(l.quantity) &&
        l.quantity >= 1 &&
        l.quantity <= MAX_LINE_QUANTITY,
    ).map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      hasInstallation: l.hasInstallation === true,
      isSelected: l.isSelected !== false,
      ...(typeof l.note === 'string' ? { note: l.note } : {}),
    }));
  } catch {
    return [];
  }
}

function writeGuestLines(lines: GuestCartLine[]): void {
  try {
    if (lines.length) localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* Không lưu được thì giữ trong bộ nhớ của phiên. */
  }
}

/**
 * Giỏ hàng dùng chung cho header (badge), popup chọn biến thể và trang giỏ.
 * Mọi thao tác thay toàn bộ giỏ bằng response của server; lỗi ném ra để nơi gọi báo cho khách.
 *
 * Khách chưa đăng nhập: các dòng lưu ở trình duyệt (`localStorage`), server chỉ tính giá/tồn kho
 * (`/cart/guest/preview`). Đăng nhập xong thì gộp vào giỏ tài khoản; chỉ thanh toán mới bắt đăng nhập.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly api = inject(CartApiService);
  private readonly auth = inject(AuthService);

  readonly cart = signal<Cart | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** BR-C09: badge là số dòng trong giỏ. */
  readonly count = computed(() => this.cart()?.items.length ?? 0);
  readonly badge = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
  readonly label = computed(() =>
    this.count() > 0 ? `Giỏ hàng, ${this.count()} sản phẩm` : 'Giỏ hàng',
  );

  private guestLines: GuestCartLine[] = readGuestLines();
  private wasAuthenticated: boolean | null = null;

  constructor() {
    effect(() => {
      const authenticated = this.auth.isAuthenticated();
      untracked(() => this.onAuthChange(authenticated));
    });
  }

  private onAuthChange(authenticated: boolean): void {
    const previous = this.wasAuthenticated;
    this.wasAuthenticated = authenticated;
    if (authenticated) {
      if (!this.guestLines.length) {
        // Đã tải giỏ khách trước khi phiên được khôi phục thì tải lại giỏ tài khoản.
        if (this.status() !== 'idle') this.load();
        return;
      }
      void this.settled();
    } else if (previous) {
      // Đăng xuất: bỏ giỏ tài khoản khỏi màn hình, quay về giỏ trình duyệt (rỗng).
      this.cart.set(null);
      this.status.set('idle');
      this.guestLines = readGuestLines();
      this.load();
    }
  }

  private merging: Promise<void> | null = null;

  /**
   * Đã đăng nhập mà còn giỏ ở trình duyệt thì gộp vào giỏ tài khoản; trả về khi gộp xong.
   * Trang thanh toán chờ hàm này để không đọc giỏ tài khoản trước khi gộp.
   */
  settled(): Promise<void> {
    if (this.auth.isAuthenticated() && this.guestLines.length) {
      this.merging ??= firstValueFrom(this.api.mergeGuest(this.guestLines))
        .then((cart) => {
          this.guestLines = [];
          writeGuestLines([]);
          this.cart.set(cart);
          this.status.set('ready');
        })
        // Gộp lỗi thì giữ giỏ trình duyệt để lần sau thử lại.
        .catch(() => this.load())
        .finally(() => {
          this.merging = null;
        });
    }
    return this.merging ?? Promise.resolve();
  }

  load(): void {
    if (!this.auth.isAuthenticated()) {
      this.loadGuest();
      return;
    }
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
    if (this.auth.isAuthenticated()) return this.apply(this.api.addItem(body));
    const existing = this.guestLines.find((l) => l.variantId === body.variantId);
    const quantity = (existing?.quantity ?? 0) + body.quantity;
    return this.applyGuest(
      this.withLine({
        ...existing,
        variantId: body.variantId,
        quantity,
        hasInstallation: body.hasInstallation,
        isSelected: true,
        ...(body.note !== undefined ? { note: body.note } : {}),
      }),
      { variantId: body.variantId, inCart: existing?.quantity ?? 0 },
    );
  }

  update(itemId: string, body: UpdateCartItemRequest): Promise<Cart> {
    if (this.auth.isAuthenticated()) return this.apply(this.api.updateItem(itemId, body));
    const line = this.guestLines.find((l) => l.variantId === itemId);
    if (!line) return Promise.reject(guestError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ'));
    const targetId = body.variantId ?? itemId;
    const other = targetId !== itemId ? this.guestLines.find((l) => l.variantId === targetId) : null;
    const quantity = (other?.quantity ?? 0) + (body.quantity ?? line.quantity);
    const next: GuestCartLine = {
      ...line,
      variantId: targetId,
      quantity,
      hasInstallation: body.hasInstallation ?? line.hasInstallation,
      isSelected: other ? other.isSelected || line.isSelected : (body.isSelected ?? line.isSelected),
      ...(body.note !== undefined ? { note: body.note } : {}),
    };
    const lines = this.guestLines.filter((l) => l.variantId !== itemId && l.variantId !== targetId);
    // Giữ nguyên thứ tự dòng khi chỉ sửa tại chỗ.
    const index = this.guestLines.findIndex((l) => l.variantId === itemId);
    lines.splice(Math.min(index, lines.length), 0, next);
    // Giảm số lượng luôn được phép; còn lại (tăng, đổi biến thể, chọn) phải còn hàng.
    const mustHaveStock =
      targetId !== itemId || quantity > line.quantity || body.isSelected === true;
    return this.applyGuest(lines, mustHaveStock ? { variantId: targetId, inCart: other?.quantity ?? line.quantity } : undefined);
  }

  remove(itemId: string): Promise<Cart> {
    if (this.auth.isAuthenticated()) return this.apply(this.api.removeItem(itemId));
    return this.applyGuest(this.guestLines.filter((l) => l.variantId !== itemId));
  }

  setSelection(isSelected: boolean, itemIds?: string[]): Promise<Cart> {
    if (this.auth.isAuthenticated()) return this.apply(this.api.setSelection(isSelected, itemIds));
    const scope = itemIds ? new Set(itemIds) : null;
    const blocked = new Set(
      (this.cart()?.items ?? []).filter((i) => isBlocking(i.warnings)).map((i) => i.variantId),
    );
    return this.applyGuest(
      this.guestLines.map((l) =>
        (!scope || scope.has(l.variantId)) && !(isSelected && blocked.has(l.variantId))
          ? { ...l, isSelected }
          : l,
      ),
    );
  }

  /**
   * FR-30: áp voucher bằng mã. Luôn trả kết quả kiểm tra; hợp lệ thì tải lại giỏ để có giảm giá mới
   * (không đổi `status` nên trang không nháy về khung chờ).
   */
  async applyVoucher(body: ApplyVoucherRequest): Promise<VoucherCheckResult> {
    if (!this.auth.isAuthenticated()) {
      return {
        voucherId: null,
        code: null,
        name: null,
        valid: false,
        reason: null,
        message: 'Đăng nhập để áp dụng mã giảm giá',
        discount: 0,
      };
    }
    const result = await firstValueFrom(this.api.applyVoucher(body));
    if (result.valid) this.cart.set(await firstValueFrom(this.api.get()));
    return result;
  }

  removeVoucher(): Promise<Cart> {
    if (!this.auth.isAuthenticated()) return Promise.resolve(this.cart() ?? EMPTY_CART);
    return this.apply(this.api.removeVoucher());
  }

  private async apply(request: Observable<Cart>): Promise<Cart> {
    const cart = await firstValueFrom(request);
    this.cart.set(cart);
    this.status.set('ready');
    return cart;
  }

  private loadGuest(): void {
    if (!this.guestLines.length) {
      this.cart.set(EMPTY_CART);
      this.status.set('ready');
      return;
    }
    this.status.set('loading');
    this.api.previewGuest(this.guestLines).subscribe({
      next: (cart) => {
        this.cart.set(cart);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  /** Dòng mới thay dòng cùng biến thể (giữ vị trí), chưa có thì thêm cuối. */
  private withLine(line: GuestCartLine): GuestCartLine[] {
    return this.guestLines.some((l) => l.variantId === line.variantId)
      ? this.guestLines.map((l) => (l.variantId === line.variantId ? line : l))
      : [...this.guestLines, line];
  }

  /**
   * Tính giá giỏ khách qua server rồi mới lưu: dòng ngừng bán hoặc vượt tồn (`check`) bị từ chối
   * giống API giỏ của tài khoản, nên màn hình xử lý lỗi dùng chung.
   */
  private async applyGuest(
    lines: GuestCartLine[],
    check?: { variantId: string; inCart: number },
  ): Promise<Cart> {
    if (lines.length > 50) {
      throw guestError(400, 'VALIDATION_ERROR', 'Giỏ hàng tối đa 50 sản phẩm khác nhau');
    }
    const cart = lines.length ? await firstValueFrom(this.api.previewGuest(lines)) : EMPTY_CART;
    const row = check && cart.items.find((i) => i.variantId === check.variantId);
    if (row?.warnings.includes('VARIANT_UNAVAILABLE')) {
      throw guestError(409, 'VARIANT_UNAVAILABLE', 'Biến thể này đã ngừng bán');
    }
    if (row && (row.warnings.includes('OUT_OF_STOCK') || row.warnings.includes('EXCEEDS_STOCK'))) {
      const available = row.warnings.includes('OUT_OF_STOCK') ? 0 : (row.available ?? 0);
      throw guestError(
        409,
        'INSUFFICIENT_STOCK',
        available <= 0 ? 'Sản phẩm đã hết hàng' : `Chỉ còn ${available} sản phẩm`,
        { available, inCart: check.inCart },
      );
    }
    this.guestLines = lines;
    writeGuestLines(lines);
    this.cart.set(cart);
    this.status.set('ready');
    return cart;
  }
}
