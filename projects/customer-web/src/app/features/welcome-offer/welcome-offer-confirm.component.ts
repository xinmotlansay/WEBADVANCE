import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { parseApiError } from '../../core/auth/auth-error';
import { AccountApiService } from '../../services/account/account-api.service';

type State = { status: 'loading' } | { status: 'ok' } | { status: 'error'; message: string };

/** Khách bấm liên kết trong email: xác nhận xong thì voucher NEW11 vào Ví voucher. */
@Component({
  selector: 'app-welcome-offer-confirm',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="confirm">
      @switch (state().status) {
        @case ('loading') {
          <p class="text" aria-live="polite">Đang xác nhận ưu đãi…</p>
        }
        @case ('ok') {
          <section>
            <h1>Đã lưu voucher vào ví!</h1>
            <p class="text">Voucher giảm 10% cho khách hàng mới đã nằm trong Ví voucher của bạn.</p>
            <a class="btn" routerLink="/account/vouchers">Vào ví voucher</a>
          </section>
        }
        @case ('error') {
          <section>
            <h1>Không xác nhận được</h1>
            <p class="text">{{ message() }}</p>
            <a class="btn" routerLink="/welcome-offer">Về trang ưu đãi</a>
          </section>
        }
      }
    </main>
  `,
  styles: `
    .confirm {
      display: grid;
      justify-items: center;
      gap: 12px;
      max-width: 620px;
      margin: 0 auto;
      padding: 48px var(--page-gutter) 96px;
      text-align: center;
    }
    section {
      display: grid;
      justify-items: center;
      gap: 12px;
    }
    h1 {
      color: var(--color-primary);
      font-size: 26px;
      font-weight: 700;
    }
    .text {
      color: #555;
      font-size: 14px;
      line-height: 1.6;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      margin-top: 8px;
      padding: 0 20px;
      border: 1px solid var(--color-primary);
      border-radius: 6px;
      background: var(--color-primary);
      color: #fff;
      font-size: 12px;
      text-transform: uppercase;
    }
  `,
})
export class WelcomeOfferConfirmComponent {
  protected readonly state = signal<State>({ status: 'loading' });
  protected message(): string {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  }

  constructor() {
    const token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set({ status: 'error', message: 'Liên kết thiếu mã xác nhận.' });
      return;
    }
    inject(AccountApiService)
      .confirmWelcomeOffer(token)
      .subscribe({
        next: () => this.state.set({ status: 'ok' }),
        error: (e: unknown) => this.state.set({ status: 'error', message: parseApiError(e).message }),
      });
  }
}
