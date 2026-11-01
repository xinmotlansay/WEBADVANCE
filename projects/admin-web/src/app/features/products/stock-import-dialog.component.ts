import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AdminApiService, apiMessage } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { ToastService } from '../../shared/ui/toast';

/** PA-08: nhập kho nhiều biến thể một lần, ghi lịch sử biến động cho từng biến thể. */
@Component({
  selector: 'app-stock-import-dialog',
  imports: [...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" aria-labelledby="import-title" (cancel)="onCancel($event)">
      <form (submit)="submit($event)">
        <header class="head">
          <h2 id="import-title">Nhập kho</h2>
          <p>Nhập số lượng nhận thêm cho từng biến thể. Để trống nếu không nhập.</p>
        </header>

        <div class="body">
          @if (products.isLoading()) {
            <div class="loading" role="status" aria-label="Đang tải biến thể">
              <span class="skeleton" style="width: 50%"></span>
              <span class="skeleton"></span>
              <span class="skeleton"></span>
            </div>
          } @else if (products.error()) {
            <div class="alert-box" role="alert">
              Không tải được danh sách biến thể.
              <button type="button" class="btn" (click)="products.reload()">Thử lại</button>
            </div>
          } @else {
            @for (product of products.value() ?? []; track product.id) {
              <fieldset>
                <legend>{{ product.name }}</legend>
                @for (variant of product.variants; track variant.id) {
                  <div class="row" [class.off]="variant.status !== 'ACTIVE'">
                    <label [for]="'qty-' + variant.id">
                      <span class="variant">{{ variant.color || 'Mặc định' }}{{ variant.material ? ' · ' + variant.material : '' }}</span>
                      <span class="meta tabular">
                        {{ variant.sku }} · tồn {{ variant.stockQuantity | num }}/{{ variant.lowStockThreshold | num }}
                        @if (variant.stockQuantity <= variant.lowStockThreshold) {
                          <span class="badge" [class.b-danger]="variant.stockQuantity === 0" [class.b-attn]="variant.stockQuantity > 0">
                            {{ variant.stockQuantity === 0 ? 'Hết hàng' : 'Sắp hết' }}
                          </span>
                        }
                      </span>
                    </label>
                    <input
                      class="input qty tabular"
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      inputmode="numeric"
                      placeholder="0"
                      [id]="'qty-' + variant.id"
                      [disabled]="variant.status !== 'ACTIVE'"
                      [value]="quantities()[variant.id] ?? ''"
                      (input)="setQty(variant.id, $any($event.target).value)"
                    />
                  </div>
                }
              </fieldset>
            }
            <div class="field">
              <label for="import-note">Ghi chú lô nhập</label>
              <input id="import-note" class="input" maxlength="300" placeholder="Ví dụ: Nhập lô tháng 10 từ xưởng Bình Dương" [value]="note()" (input)="note.set($any($event.target).value)" />
            </div>
          }
          @if (error()) {
            <div class="alert-box" role="alert">{{ error() }}</div>
          }
        </div>

        <footer class="foot">
          <span class="muted">{{ lineCount() }} biến thể · tổng {{ totalQty() | num }} sản phẩm</span>
          <div class="actions">
            <button type="button" class="btn" [disabled]="busy()" (click)="cancelled.emit()">Quay lại</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy() || !lineCount()">
              {{ busy() ? 'Đang nhập kho…' : 'Nhập kho' }}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    .dialog {
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      padding: 0;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      color: var(--cv-navy);
      box-shadow: var(--cv-shadow);
    }
    .dialog::backdrop {
      background: rgba(11, 48, 86, 0.28);
    }
    form {
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 48px);
    }
    .head {
      padding: 20px 24px 12px;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
    }
    .head p {
      margin: 0;
      font-size: 13px;
      color: var(--cv-muted);
    }
    .body {
      display: grid;
      gap: 16px;
      padding: 0 24px 16px;
      overflow-y: auto;
    }
    .loading {
      display: grid;
      gap: 12px;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      border-top: 1px solid var(--cv-line-soft);
    }
    .row.off {
      opacity: 0.5;
    }
    .row label {
      display: grid;
      gap: 2px;
      min-width: 0;
      font-size: 13px;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--cv-muted);
    }
    .qty {
      width: 96px;
      text-align: right;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 24px;
      border-top: 1px solid var(--cv-border);
      background: var(--cv-surface-alt);
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
  `,
})
export class StockImportDialogComponent implements AfterViewInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly productIds = input.required<string[]>();
  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly quantities = signal<Record<string, number>>({});
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly products = rxResource({
    request: () => this.productIds(),
    loader: ({ request }) => forkJoin(request.map((id) => this.api.product(id))),
  });

  private readonly lines = computed(() =>
    Object.entries(this.quantities())
      .filter(([, quantity]) => quantity > 0)
      .map(([variantId, quantity]) => ({ variantId, quantity })),
  );
  protected readonly lineCount = computed(() => this.lines().length);
  protected readonly totalQty = computed(() => this.lines().reduce((sum, line) => sum + line.quantity, 0));

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected setQty(variantId: string, raw: string): void {
    const quantity = Math.min(10_000, Math.max(0, Math.floor(Number(raw) || 0)));
    this.quantities.update((current) => ({ ...current, [variantId]: quantity }));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy() || !this.lineCount()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.bulkImport(this.lines(), this.note().trim() || undefined).subscribe({
      next: ({ results }) => {
        this.busy.set(false);
        const total = results.reduce((sum, r) => sum + (r.after - r.before), 0);
        this.toast.show(`Đã nhập kho ${total.toLocaleString('vi-VN')} sản phẩm cho ${results.length} biến thể.`);
        this.done.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiMessage(error));
      },
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.cancelled.emit();
  }
}
