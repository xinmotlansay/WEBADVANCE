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
import { AdminApiService, apiMessage, type InventoryRow } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { ToastService } from '../../shared/ui/toast';

/** PA-08: nhập kho cùng lúc các biến thể đang chọn ở trang Tồn kho (một lô, một ghi chú). */
@Component({
  selector: 'app-variant-import-dialog',
  imports: [...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="modal" aria-labelledby="vimp-title" (cancel)="onCancel($event)">
      <form (submit)="submit($event)">
        <header class="modal-head">
          <h2 id="vimp-title">Nhập kho {{ rows().length }} biến thể</h2>
          <p>Nhập số lượng nhận thêm cho từng biến thể. Để trống nếu không nhập.</p>
        </header>
        <div class="modal-body">
          @for (row of rows(); track row.variantId) {
            <div class="line">
              <label [for]="'vq-' + row.variantId">
                <span>{{ row.productName }}{{ row.color ? ' · ' + row.color : '' }}</span>
                <span class="cell-sub tabular">{{ row.sku }} · tồn {{ row.stockQuantity | num }}/{{ row.lowStockThreshold | num }}</span>
              </label>
              <input
                class="input tabular qty"
                type="number"
                min="0"
                max="10000"
                inputmode="numeric"
                placeholder="0"
                [id]="'vq-' + row.variantId"
                [value]="quantities()[row.variantId] ?? ''"
                (input)="setQty(row.variantId, $any($event.target).value)"
              />
            </div>
          }
          <div class="field">
            <label for="vimp-note">Ghi chú lô nhập</label>
            <input id="vimp-note" class="input" maxlength="300" placeholder="Ví dụ: Nhập lô tháng 11 từ xưởng Bình Dương" [value]="note()" (input)="note.set($any($event.target).value)" />
          </div>
          @if (error()) {
            <div class="alert-box" role="alert">{{ error() }}</div>
          }
        </div>
        <footer class="modal-foot">
          <span class="grow">{{ lines().length }} biến thể · tổng {{ total() | num }} sản phẩm</span>
          <button type="button" class="btn" [disabled]="busy()" (click)="cancelled.emit()">Quay lại</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy() || !lines().length">{{ busy() ? 'Đang nhập kho…' : 'Nhập kho' }}</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    .line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-top: 8px;
      border-top: 1px solid var(--cv-line-soft);
    }
    .line label {
      display: grid;
      gap: 2px;
      min-width: 0;
      font-size: 13px;
    }
    .qty {
      width: 96px;
      text-align: right;
    }
  `,
})
export class VariantImportDialogComponent implements AfterViewInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly rows = input.required<InventoryRow[]>();
  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly quantities = signal<Record<string, number>>({});
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly lines = computed(() =>
    Object.entries(this.quantities())
      .filter(([, quantity]) => quantity > 0)
      .map(([variantId, quantity]) => ({ variantId, quantity })),
  );
  protected readonly total = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));

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
    if (this.busy() || !this.lines().length) return;
    this.busy.set(true);
    this.error.set('');
    this.api.bulkImport(this.lines(), this.note().trim() || undefined).subscribe({
      next: ({ results }) => {
        this.busy.set(false);
        this.toast.show(`Đã nhập kho ${this.total().toLocaleString('vi-VN')} sản phẩm cho ${results.length} biến thể.`);
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
