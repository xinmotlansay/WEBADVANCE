import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AfterSalesRequest, PublicConfig, WarrantyCard } from 'shared';
import { STATUS_LABELS } from '../../shared/ui/request-timeline/request-timeline.component';
interface SupportRequest extends AfterSalesRequest {
  kind: 'warranty' | 'return';
}
@Component({
  selector: 'app-support-overview',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-overview.component.html',
  styleUrl: './support-overview.component.css',
})
export class SupportOverviewComponent {
  readonly config = input<PublicConfig | null>();
  readonly loggedIn = input(false);
  readonly loading = input(false);
  readonly failed = input(false);
  readonly recentRequests = input<SupportRequest[]>([]);
  readonly cards = input<WarrantyCard[] | null>();
  readonly cardSelected = output<string>();
  protected readonly search = signal({ order: '', product: '' });
  protected readonly filteredCards = computed(() => {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
    const { order, product } = this.search();
    const code = normalize(order),
      name = normalize(product);
    return [...(this.cards() ?? [])]
      .sort((a, b) => Date.parse(b.activatedAt) - Date.parse(a.activatedAt))
      .filter(
        (card) =>
          (!code && !name) ||
          (code && normalize(card.orderCode).includes(code)) ||
          (name && normalize(card.productName).includes(name)),
      );
  });
  protected searchCards(order: string, product: string): void {
    this.search.set({ order: order.trim(), product: product.trim() });
  }
  readonly viewRequests = output<void>();
  readonly requestSelected = output<{ kind: 'warranty' | 'return'; id: string }>();
  readonly reload = output<void>();
  protected readonly labels = STATUS_LABELS;
  protected statusClass(status: string): string {
    return status === 'COMPLETED'
      ? 'complete'
      : ['REJECTED', 'CANCELLED'].includes(status)
        ? 'closed'
        : 'pending';
  }
}
