import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';
import { AccountApiService, type AccountVoucher } from '../../services/account/account-api.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

/** Dải dưới header báo khách có voucher được tặng (chiến dịch giữ chân). Xem/đóng một lần là ẩn hẳn. */
@Component({
  selector: 'app-gift-voucher-strip',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as message) {
      <div class="strip" role="status">
        <a routerLink="/account/vouchers" (click)="dismiss()">{{ message }}</a>
        <button type="button" class="close" aria-label="Đóng thông báo ưu đãi" (click)="dismiss()">
          <app-icon name="lucide:x" [size]="16" />
        </button>
      </div>
    }
  `,
  styles: `
    .strip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px var(--page-gutter);
      background: var(--color-accent);
      color: var(--color-white);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      text-align: center;
    }
    a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .close {
      display: grid;
      flex: none;
      place-items: center;
      min-width: 32px;
      min-height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
  `,
})
export class GiftVoucherStripComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AccountApiService);
  private readonly gift = signal<AccountVoucher | null>(null);

  protected readonly text = computed(() => {
    const v = this.gift();
    if (!v) return null;
    const off =
      v.discountType === 'PERCENT' ? `${v.discountValue}%` : `${v.discountValue.toLocaleString('vi-VN')} ₫`;
    const d = new Date(v.expiresAt);
    const until = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `Bạn có ưu đãi giảm ${off} dành riêng, dùng đến ${until}`;
  });

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.gift.set(null);
        return;
      }
      untracked(() =>
        this.api.newGiftVouchers().subscribe({ next: (list) => this.gift.set(list[0] ?? null), error: () => {} }),
      );
    });
  }

  protected dismiss(): void {
    this.gift.set(null);
    this.api.markGiftVouchersSeen().subscribe({ error: () => {} });
  }
}
