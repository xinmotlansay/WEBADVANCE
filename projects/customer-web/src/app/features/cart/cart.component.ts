import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiResponse } from 'shared';
import { CartService } from '../../core/shopping/cart.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

interface Quote { totalAmount: number; items: { variantId: string; quantity: number; unitPrice: number; installationFee: number; finalAmount: number }[]; }
@Component({
  selector: 'app-cart', imports: [RouterLink, ReactiveFormsModule, VndPipe],
  templateUrl: './cart.component.html', styleUrl: './cart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly checkout = this.router.url.startsWith('/checkout');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly quoted = signal<Quote | null>(null);
  protected readonly completed = signal<{ orderCode: string; totalAmount: number } | null>(null);
  private readonly quoteKey = signal('');
  private readonly itemKey = computed(() => JSON.stringify(this.cart.items().map((item) => ({ variantId: item.variantId, quantity: item.quantity }))));
  protected readonly currentQuote = computed(() => this.itemKey() === this.quoteKey() ? this.quoted() : null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    recipientName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    recipientPhone: ['', [Validators.required, Validators.pattern(/^(?:0|\+84)[0-9]{9,10}$/)]],
    addressLine: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  constructor() { if (this.checkout && this.cart.items().length) this.refresh(); }

  protected pricedLine(id: string) { return this.currentQuote()?.items.find((item) => item.variantId === id); }

  private requestId(): string {
    const signature = this.itemKey();
    try {
      const previous = JSON.parse(sessionStorage.getItem('caraveso.checkout-request') ?? 'null');
      if (previous?.signature === signature && typeof previous.id === 'string') return previous.id;
    } catch { /* Start a new checkout request. */ }
    const id = crypto.randomUUID();
    try { sessionStorage.setItem('caraveso.checkout-request', JSON.stringify({ signature, id })); } catch { /* Storage may be disabled. */ }
    return id;
  }

  protected refresh(): void {
    if (this.busy() || !this.cart.items().length) return;
    this.busy.set(true); this.error.set(''); this.quoted.set(null);
    const key = this.itemKey();
    this.http.post<ApiResponse<Quote>>('/api/v1/checkout/quote', { items: JSON.parse(key) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (response) => { this.quoteKey.set(key); this.quoted.set(response.data); this.busy.set(false); },
        error: (error: unknown) => { this.error.set(apiErrorMessage(error)); this.busy.set(false); },
      });
  }

  protected submit(): void {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    const quote = this.currentQuote();
    if (this.form.invalid || !quote) return;
    if (!this.auth.user()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/checkout' } }); return;
    }
    this.busy.set(true); this.error.set('');
    this.http.post<ApiResponse<{ orderCode: string; totalAmount: number }>>('/api/v1/checkout', {
      requestId: this.requestId(), items: JSON.parse(this.itemKey()), expectedTotal: quote.totalAmount,
      shippingAddress: this.form.getRawValue(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.completed.set(response.data); this.cart.clear(); this.busy.set(false);
        try { sessionStorage.removeItem('caraveso.checkout-request'); } catch { /* Storage may be disabled. */ }
      },
      error: (error: unknown) => { this.error.set(apiErrorMessage(error)); this.busy.set(false); },
    });
  }
}
