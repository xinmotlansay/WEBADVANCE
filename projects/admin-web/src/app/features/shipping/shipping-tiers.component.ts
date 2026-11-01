import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { AdminApiService, apiMessage, type ShippingRow } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { NotificationBellComponent, type BellItem } from '../../shared/ui/notification-bell.component';
import { ToastService } from '../../shared/ui/toast';

/** Điều kiện từng cấp (requirements Phần A mục 1.2). */
export const TIER_RULES: Record<number, { name: string; rule: string }> = {
  1: { name: 'Nhỏ', rule: 'Mọi cạnh ≤ 60 cm và ≤ 10 kg' },
  2: { name: 'Vừa', rule: 'Cạnh dài nhất ≤ 120 cm và ≤ 30 kg' },
  3: { name: 'Lớn (cồng kềnh)', rule: 'Cạnh dài nhất ≤ 200 cm và ≤ 80 kg, hoặc nhiều kiện' },
  4: { name: 'Rất lớn (cồng kềnh)', rule: 'Cạnh dài nhất > 200 cm hoặc > 80 kg' },
};

/** Gán cấp vận chuyển cho từng biến thể, đối chiếu với cấp gợi ý theo kích thước (ma trận mục 5). */
@Component({
  selector: 'app-shipping-tiers',
  imports: [RouterLink, IconComponent, BulkBarComponent, ConfirmDialogComponent, NotificationBellComponent, ...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipping-tiers.component.html',
  styleUrl: './shipping-tiers.component.css',
})
export class ShippingTiersComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly rules = TIER_RULES;
  protected readonly tierList = [1, 2, 3, 4];

  protected readonly searchText = signal('');
  private readonly search = toSignal(toObservable(this.searchText).pipe(debounceTime(300)), { initialValue: '' });
  protected readonly tierFilter = signal<number | null>(null);
  protected readonly mismatchOnly = signal(false);
  protected readonly page = signal(1);

  protected readonly result = rxResource({
    request: () => ({
      q: this.search().trim() || undefined,
      tier: this.tierFilter() ?? undefined,
      mismatch: this.mismatchOnly() || undefined,
      page: this.page(),
      limit: 20,
    }),
    loader: ({ request }) => this.api.shippingTiers(request),
  });
  protected readonly rows = computed(() => this.result.value()?.data ?? []);
  protected readonly tiers = computed(() => this.result.value()?.tiers ?? []);
  protected readonly hasFilters = computed(() => !!this.search().trim() || this.tierFilter() !== null || this.mismatchOnly());
  protected readonly bell = computed<BellItem[]>(() => {
    const count = this.result.value()?.mismatchCount ?? 0;
    return count ? [{ key: 'MISMATCH', title: `${count} biến thể lệch cấp gợi ý`, detail: 'Kiểm tra kích thước hoặc áp dụng cấp gợi ý' }] : [];
  });

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.variantId)));
  protected readonly busy = signal(false);
  /** Hạ cấp biến thể đang có lắp đặt xuống 1–2 thì hỏi trước (lắp đặt bị bỏ). */
  protected readonly pendingDowngrade = signal<{ row: ShippingRow; tier: number } | null>(null);

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.reset();
  }

  protected setTier(tier: number): void {
    this.tierFilter.set(this.tierFilter() === tier ? null : tier);
    this.reset();
  }

  protected toggleMismatch(): void {
    this.mismatchOnly.set(!this.mismatchOnly());
    this.reset();
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.tierFilter.set(null);
    this.mismatchOnly.set(false);
    this.reset();
  }

  protected toggleRow(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.rows().map((r) => r.variantId)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected goPage(page: number): void {
    this.page.set(page);
    this.clearSelection();
  }

  protected dims(row: ShippingRow): string {
    const { length, width, height } = row.dimensions;
    return length && width && height ? `${length}×${width}×${height}` : '—';
  }

  protected choose(row: ShippingRow, raw: string): void {
    const tier = Number(raw);
    if (!tier || tier === row.shippingTier) return;
    if (tier < 3 && row.installationService !== 'NONE') {
      this.pendingDowngrade.set({ row, tier });
      return;
    }
    this.save(row, tier);
  }

  protected save(row: ShippingRow, tier: number): void {
    this.busy.set(true);
    this.api.setShippingTier(row.variantId, tier).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.pendingDowngrade.set(null);
        this.toast.show(`${result.sku}: cấp ${result.after}.${result.droppedInstallation ? ' Đã bỏ dịch vụ lắp đặt.' : ''}`);
        this.result.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.pendingDowngrade.set(null);
        this.toast.show(apiMessage(error), 'error');
        this.result.reload();
      },
    });
  }

  protected applySuggested(ids: string[]): void {
    this.busy.set(true);
    this.api.applySuggestedTiers(ids).subscribe({
      next: ({ updated, skipped }) => {
        this.busy.set(false);
        this.clearSelection();
        this.toast.show(
          `Đã cập nhật ${updated} biến thể theo cấp gợi ý${skipped ? `, bỏ qua ${skipped} biến thể thiếu kích thước` : ''}.`,
        );
        this.result.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  protected applySelected(): void {
    this.applySuggested([...this.selected()]);
  }

  private reset(): void {
    this.page.set(1);
    this.clearSelection();
  }
}
