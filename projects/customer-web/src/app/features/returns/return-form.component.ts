import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  input,
  output,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import {
  CatalogApiService,
  EligibleOrder,
  OrderSummary,
  PageMeta,
  ReturnExchangeService,
  ReturnSubmission,
} from 'shared';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { EvidenceUploadComponent } from '../../shared/ui/evidence-upload/evidence-upload.component';
@Component({
  selector: 'app-return-form',
  imports: [ReactiveFormsModule, RouterLink, EvidenceUploadComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-form.component.html',
})
export class ReturnFormComponent {
  readonly embedded = input(false);
  readonly requestCreated = output<string>();
  private readonly api = inject(ReturnExchangeService);
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly reload = new Subject<number>();
  protected readonly retryOrder = new Subject<number>();
  protected readonly orderPage = signal(1);
  protected readonly orderMeta = signal<PageMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  protected readonly orders = toSignal(
    this.reload.pipe(
      startWith(0),
      switchMap(() =>
        this.api.orders(this.orderPage()).pipe(
          tap((r) => this.orderMeta.set(r.meta)),
          map((r) => r.data),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
  protected readonly order = signal<EligibleOrder | null>(null);
  protected readonly orderLoading = signal(false);
  protected readonly orderError = signal('');
  protected readonly evidence = signal<string[]>([]);
  protected readonly uploading = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    orderId: ['', Validators.required],
    orderItemId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    type: ['RETURN' as 'RETURN' | 'EXCHANGE', Validators.required],
    reason: ['CHANGED_MIND', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(3000)]],
    replacementVariantId: '',
    refundAccount: this.fb.nonNullable.group({
      bankName: '',
      accountNumber: '',
      accountHolder: '',
    }),
    contact: this.fb.nonNullable.group({
      name: [
        this.auth.user()?.fullName ?? '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
      ],
      phone: ['', [Validators.required, Validators.pattern(/^(?:0|\+?84)\d{9,10}$/)]],
      address: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    }),
  });
  protected readonly replacementSearch = new FormControl('', { nonNullable: true });
  protected readonly replacementSlug = new FormControl('', { nonNullable: true });
  protected readonly replacements = toSignal(
    this.replacementSearch.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) =>
        this.catalog.getProducts({ q, inStock: true, limit: 20 }).pipe(
          map((r) => r.items),
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
  protected readonly replacementDetail = toSignal(
    this.replacementSlug.valueChanges.pipe(
      tap(() => this.form.controls.replacementVariantId.setValue('')),
      switchMap((slug) =>
        slug
          ? this.catalog.getProduct(slug).pipe(
              catchError(() => of(null)),
              startWith(null),
            )
          : of(null),
      ),
    ),
  );
  constructor() {
    this.form.controls.type.valueChanges
      .pipe(startWith(this.form.controls.type.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        const bank = this.form.controls.refundAccount.controls;
        bank.bankName.setValidators(
          type === 'RETURN'
            ? [Validators.required, Validators.minLength(2), Validators.maxLength(100)]
            : [],
        );
        bank.accountNumber.setValidators(
          type === 'RETURN' ? [Validators.required, Validators.pattern(/^\d{6,30}$/)] : [],
        );
        bank.accountHolder.setValidators(
          type === 'RETURN'
            ? [Validators.required, Validators.minLength(2), Validators.maxLength(100)]
            : [],
        );
        this.form.controls.replacementVariantId.setValidators(
          type === 'EXCHANGE' ? [Validators.required] : [],
        );
        for (const control of [
          bank.bankName,
          bank.accountNumber,
          bank.accountHolder,
          this.form.controls.replacementVariantId,
        ])
          control.updateValueAndValidity({ emitEvent: false });
      });
    combineLatest([
      this.form.controls.orderId.valueChanges.pipe(startWith(''), distinctUntilChanged()),
      this.retryOrder.pipe(startWith(0)),
    ])
      .pipe(
        tap(() => {
          this.form.controls.orderItemId.setValue('');
          this.form.controls.quantity.setValue(1);
          this.order.set(null);
          this.orderError.set('');
          this.orderLoading.set(true);
        }),
        switchMap(([id]) =>
          id
            ? this.api.order(id).pipe(
                catchError((error: unknown) => {
                  this.orderError.set(apiErrorMessage(error));
                  return of(null);
                }),
              )
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((order) => {
        this.order.set(order);
        this.orderLoading.set(false);
      });
  }
  protected maxQuantity(): number {
    return (
      this.order()?.items.find((i) => i.id === this.form.controls.orderItemId.value)
        ?.returnableQuantity ?? 1
    );
  }
  protected hasEligibleItems(): boolean {
    return this.order()?.items.some((i) => i.actions.canReturn) ?? false;
  }
  protected submit(): void {
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.loading() || this.uploading() || this.orderLoading()) return;
    const value = this.form.getRawValue();
    if (
      this.form.invalid ||
      !this.evidence().length ||
      !this.order()?.items.some((i) => i.id === value.orderItemId && i.actions.canReturn) ||
      value.quantity > this.maxQuantity()
    ) {
      this.error.set(
        'Chọn sản phẩm đủ điều kiện, số lượng hợp lệ, thêm minh chứng và điền đủ mô tả, thông tin liên hệ.',
      );
      return;
    }
    if (
      ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT'].includes(value.reason) &&
      !this.evidence().some((url) => /\.(mp4|mov)$/i.test(url))
    ) {
      this.error.set('Lý do này cần video mở hàng làm minh chứng.');
      return;
    }
    if (
      value.type === 'RETURN' &&
      (value.refundAccount.bankName.trim().length < 2 ||
        !/^\d{6,30}$/.test(value.refundAccount.accountNumber.trim()) ||
        value.refundAccount.accountHolder.trim().length < 2)
    ) {
      this.error.set('Vui lòng điền ngân hàng, số tài khoản 6–30 chữ số và tên chủ tài khoản.');
      return;
    }
    if (value.type === 'EXCHANGE' && !value.replacementVariantId) {
      this.error.set('Vui lòng chọn sản phẩm và biến thể thay thế.');
      return;
    }
    const { refundAccount, replacementVariantId, ...rest } = value;
    const body: ReturnSubmission = {
      ...rest,
      evidence: this.evidence(),
      ...(value.type === 'RETURN' ? { refundAccount } : { replacementVariantId }),
    };
    this.loading.set(true);
    this.api
      .create(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (this.embedded()) {
            this.requestCreated.emit(result.id);
            this.loading.set(false);
          } else void this.router.navigate(['/account/returns', result.id]);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }
}
