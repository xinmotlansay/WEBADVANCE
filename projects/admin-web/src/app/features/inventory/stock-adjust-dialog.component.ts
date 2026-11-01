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
import { forkJoin, of } from 'rxjs';
import { AdminApiService, apiMessage, type InventoryRow } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { ToastService } from '../../shared/ui/toast';

type AdjustType = 'IMPORT' | 'STOCKTAKE' | 'ADJUSTMENT';

const TYPE_INFO: Record<AdjustType, { label: string; hint: string; qtyLabel: string }> = {
  IMPORT: { label: 'Nhập kho', hint: 'Cộng thêm số lượng nhận về.', qtyLabel: 'Số lượng nhập' },
  STOCKTAKE: { label: 'Kiểm kê', hint: 'Đặt lại tồn bằng số đếm thực tế.', qtyLabel: 'Tồn thực tế' },
  ADJUSTMENT: { label: 'Điều chỉnh', hint: 'Cộng hoặc trừ (hàng hỏng, thất lạc…). Nhập số âm để trừ.', qtyLabel: 'Số lượng thay đổi (±)' },
};

/** PA-08: cập nhật tồn một biến thể (nhập, kiểm kê, điều chỉnh) và ngưỡng cảnh báo; mọi thay đổi ghi lịch sử. */
@Component({
  selector: 'app-stock-adjust-dialog',
  imports: [...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="modal" aria-labelledby="adj-title" (cancel)="onCancel($event)">
      <form (submit)="submit($event)" novalidate>
        <header class="modal-head">
          <h2 id="adj-title">Cập nhật tồn kho</h2>
          <p>
            {{ row().productName }} · <span class="tabular">{{ row().sku }}</span>{{ row().color ? ' · ' + row().color : '' }}
          </p>
        </header>

        <div class="modal-body">
          <div class="now">
            <div><span class="muted">Tồn hiện tại</span><strong class="tabular">{{ row().stockQuantity | num }}</strong></div>
            <div><span class="muted">Sau khi lưu</span><strong class="tabular" [class.qty-low]="after() !== null && after()! > 0 && after()! <= threshold()" [class.qty-out]="after() === 0 || (after() ?? 0) < 0">{{ after() === null ? '—' : (after() | num) }}</strong></div>
            <div><span class="muted">Ngưỡng cảnh báo</span><strong class="tabular">{{ threshold() | num }}</strong></div>
          </div>

          <div class="field">
            <span class="label">Loại cập nhật</span>
            <div class="toggles" role="radiogroup" aria-label="Loại cập nhật">
              @for (t of types; track t) {
                <button type="button" class="toggle" role="radio" [class.on]="type() === t" [attr.aria-checked]="type() === t" (click)="setType(t)">{{ info[t].label }}</button>
              }
            </div>
            <span class="hint">{{ info[type()].hint }}</span>
          </div>

          <div class="grid2f">
            <div class="field">
              <label for="adj-qty">{{ info[type()].qtyLabel }}</label>
              <input id="adj-qty" class="input tabular num" type="number" step="1" [min]="type() === 'ADJUSTMENT' ? -100000 : 0" inputmode="numeric" [value]="qty() ?? ''" (input)="setQty($any($event.target).value)" />
            </div>
            <div class="field">
              <label for="adj-th">Ngưỡng cảnh báo</label>
              <input id="adj-th" class="input tabular num" type="number" min="0" step="1" [value]="threshold()" (input)="threshold.set(toInt($any($event.target).value, row().lowStockThreshold))" />
            </div>
          </div>

          <div class="field">
            <label for="adj-note">Ghi chú{{ type() === 'IMPORT' ? '' : ' (bắt buộc)' }}</label>
            <input id="adj-note" class="input" maxlength="300" [value]="note()" (input)="note.set($any($event.target).value)" [placeholder]="type() === 'IMPORT' ? 'Lô nhập, nhà cung cấp…' : 'Lý do: kiểm kê cuối tháng, hàng hỏng khi vận chuyển…'" />
          </div>

          @if (error()) {
            <div class="alert-box" role="alert">{{ error() }}</div>
          }
        </div>

        <footer class="modal-foot">
          <button type="button" class="btn" [disabled]="busy()" (click)="cancelled.emit()">Quay lại</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy() || !canSave()">{{ busy() ? 'Đang lưu…' : 'Lưu' }}</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    .label {
      font-weight: 500;
    }
    .now {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border: 1px solid var(--cv-border);
      border-radius: var(--cv-radius-lg);
    }
    .now > div {
      display: grid;
      gap: 4px;
      padding: 12px 16px;
      font-size: 12px;
    }
    .now > div + div {
      border-left: 1px solid var(--cv-border);
    }
    .now strong {
      font-size: 22px;
      font-weight: 600;
    }
    .grid2f {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .num {
      text-align: right;
    }
  `,
})
export class StockAdjustDialogComponent implements AfterViewInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly row = input.required<InventoryRow>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly types: AdjustType[] = ['IMPORT', 'STOCKTAKE', 'ADJUSTMENT'];
  protected readonly info = TYPE_INFO;
  protected readonly type = signal<AdjustType>('IMPORT');
  protected readonly qty = signal<number | null>(null);
  protected readonly threshold = signal(0);
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly after = computed(() => {
    const qty = this.qty();
    if (qty === null) return null;
    const before = this.row().stockQuantity;
    return this.type() === 'STOCKTAKE' ? qty : before + qty;
  });
  private readonly stockChanged = computed(() => this.qty() !== null && this.after() !== this.row().stockQuantity);
  private readonly thresholdChanged = computed(() => this.threshold() !== this.row().lowStockThreshold);
  protected readonly canSave = computed(() => {
    if (!this.stockChanged() && !this.thresholdChanged()) return false;
    if (this.stockChanged()) {
      if ((this.after() ?? 0) < 0) return false;
      if (this.type() === 'IMPORT' && !((this.qty() ?? 0) > 0)) return false;
      if (this.type() !== 'IMPORT' && this.note().trim().length < 3) return false;
    }
    return true;
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    this.threshold.set(this.row().lowStockThreshold);
    this.dialog().nativeElement.showModal();
  }

  protected setType(type: AdjustType): void {
    this.type.set(type);
    this.qty.set(null);
  }

  protected setQty(raw: string): void {
    this.qty.set(raw === '' ? null : this.toInt(raw, 0));
  }

  protected toInt(raw: string, fallback: number): number {
    const value = Math.trunc(Number(raw));
    return Number.isFinite(value) ? value : fallback;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy() || !this.canSave()) return;
    const row = this.row();
    this.busy.set(true);
    this.error.set('');
    const stock$ = this.stockChanged()
      ? this.api.adjustStock(row.variantId, {
          changeType: this.type(),
          quantity: this.qty()!,
          note: this.note().trim() || undefined,
        })
      : of(null);
    const threshold$ = this.thresholdChanged() ? this.api.setThreshold(row.variantId, this.threshold()) : of(null);
    forkJoin([stock$, threshold$]).subscribe({
      next: ([stock]) => {
        this.busy.set(false);
        this.toast.show(
          stock
            ? `${row.sku}: tồn ${stock.before.toLocaleString('vi-VN')} → ${stock.after.toLocaleString('vi-VN')}.${stock.lowStock ? ' Dưới ngưỡng cảnh báo.' : ''}`
            : `${row.sku}: ngưỡng cảnh báo mới là ${this.threshold().toLocaleString('vi-VN')}.`,
        );
        this.saved.emit();
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
