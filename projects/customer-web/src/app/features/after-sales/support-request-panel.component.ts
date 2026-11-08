import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { EligibleOrder, ReturnExchangeService, WarrantyCard } from 'shared';
import { ReturnFormComponent } from '../returns/return-form.component';
import { WarrantyFormComponent } from '../warranty/warranty-form.component';

type PanelKind = 'warranty' | 'return';

interface ReturnCandidate {
  orderId: string;
  orderCode: string;
  itemId: string;
  name: string;
  canReturn: boolean;
  deadline: string | null;
}

/** Bỏ dấu và hoa thường để tìm "ghe go" ra "Ghế gỗ". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Khung yêu cầu bảo hành / đổi trả xổ xuống ngay trên trang hỗ trợ: tìm sản phẩm, chọn sản phẩm
 * còn trong thời hạn, rồi nhập thông tin yêu cầu, không phải sang trang khác.
 */
@Component({
  selector: 'app-support-request-panel',
  imports: [DatePipe, RouterLink, WarrantyFormComponent, ReturnFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-request-panel.component.html',
  styleUrl: './support-request-panel.component.css',
})
export class SupportRequestPanelComponent {
  private readonly returns = inject(ReturnExchangeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly searchForm = viewChild<ElementRef<HTMLFormElement>>('searchForm');

  readonly kind = input.required<PanelKind>();
  readonly loggedIn = input(false);
  /** Phiếu bảo hành của khách; `undefined` đang tải, `null` tải lỗi. */
  readonly cards = input<WarrantyCard[] | null | undefined>();
  readonly presetCardId = input('');
  readonly closed = output<void>();
  readonly requestCreated = output<{ kind: PanelKind; id: string }>();

  protected readonly orderQuery = signal('');
  protected readonly nameQuery = signal('');
  protected readonly hasQuery = computed(() => !!(normalize(this.orderQuery()) || normalize(this.nameQuery())));
  protected readonly pickedCardId = signal('');
  protected readonly pickedItem = signal<ReturnCandidate | null>(null);

  protected readonly pickedCard = computed(() => {
    const id = this.pickedCardId() || this.presetCardId();
    const card = id ? (this.cards() ?? []).find((c) => c.id === id) : undefined;
    // Chỉ phiếu còn hạn mới được mở form (kể cả khi mở từ link có sẵn `card`).
    return card?.status === 'VALID' ? card : null;
  });

  protected readonly warrantyResults = computed(() => {
    const order = normalize(this.orderQuery());
    const name = normalize(this.nameQuery());
    return [...(this.cards() ?? [])]
      .sort((a, b) => Date.parse(b.activatedAt) - Date.parse(a.activatedAt))
      .filter(
        (card) =>
          (!order || normalize(card.orderCode).includes(order)) &&
          (!name || normalize(card.productName).includes(name)),
      );
  });

  /** Đơn đã giao kèm từng sản phẩm, chỉ tải khi mở khung đổi trả. */
  private readonly returnOrders = toSignal(
    combineLatest([toObservable(this.kind), toObservable(this.loggedIn)]).pipe(
      switchMap(([kind, loggedIn]) =>
        kind === 'return' && loggedIn
          ? this.returns.orders(1).pipe(
              switchMap((page) =>
                page.data.length
                  ? forkJoin(
                      page.data.map((order) =>
                        this.returns.order(order.id).pipe(catchError(() => of(null))),
                      ),
                    )
                  : of([] as (EligibleOrder | null)[]),
              ),
              map((orders) => orders.filter((order): order is EligibleOrder => !!order)),
              catchError(() => of(null)),
              startWith(undefined),
            )
          : of(undefined),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly returnResults = computed<ReturnCandidate[] | null | undefined>(() => {
    const orders = this.returnOrders();
    if (!orders) return orders as null | undefined;
    const order = normalize(this.orderQuery());
    const name = normalize(this.nameQuery());
    return orders
      .flatMap((order) =>
        order.items.map((item) => ({
          orderId: order.id,
          orderCode: order.orderCode,
          itemId: item.id,
          name: item.name,
          canReturn: item.actions.canReturn,
          deadline: order.returnDeadline,
        })),
      )
      .filter(
        (row) =>
          (!order || normalize(row.orderCode).includes(order)) &&
          (!name || normalize(row.name).includes(name)),
      );
  });

  constructor() {
    // Khung vừa xổ xuống thì cuộn tới đó, để khách thấy thao tác tiếp theo ngay.
    // Cũng cuộn lại khi khách bấm sang loại yêu cầu còn lại (khung được tái sử dụng).
    // Dừng ở hàng 2 ô chọn loại để thấy cả tiêu đề khung và ô tìm kiếm ngay bên dưới.
    effect(() => {
      this.kind();
      this.pickedCardId.set('');
      this.pickedItem.set(null);
      this.scrollToCards();
    });
  }

  protected search(order: string, name: string): void {
    this.orderQuery.set(order);
    this.nameQuery.set(name);
    // Tìm lại thì quay về danh sách kết quả, bỏ lựa chọn cũ.
    this.pickedCardId.set('');
    this.pickedItem.set(null);
  }

  protected pickCard(id: string): void {
    this.clearSearch();
    this.pickedCardId.set(id);
    this.scrollTo('.step-target');
  }

  protected pickItem(row: ReturnCandidate): void {
    this.clearSearch();
    this.pickedItem.set(row);
    this.scrollTo('.step-target');
  }

  protected backToSearch(): void {
    this.pickedCardId.set('');
    this.pickedItem.set(null);
    this.scrollTo('[data-scroll-target="search"]');
  }

  /** Xóa ô tìm kiếm (cả giá trị đang gõ dở) khi đã chọn sản phẩm. */
  private clearSearch(): void {
    this.orderQuery.set('');
    this.nameQuery.set('');
    this.searchForm()?.nativeElement.reset();
  }

  /** Cuộn mượt để hàng 2 ô chọn loại nằm ngay dưới thanh header. */
  private scrollToCards(): void {
    afterNextRender(
      () => {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Chờ router cuộn lên đầu trang xong (scrollPositionRestoration) rồi mới cuộn tới đích.
        setTimeout(() => {
          const cards = this.host.nativeElement.parentElement?.querySelector('.service-grid');
          if (!cards) return;
          const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-offset')) || 115;
          const top = cards.getBoundingClientRect().top + window.scrollY - header - 36;
          window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
        }, 120);
      },
      { injector: this.injector },
    );
  }

  /** Cuộn mượt tới selector đầu tiên tìm thấy sau khi Angular vẽ xong; tắt cuộn mượt nếu máy bật giảm chuyển động. */
  private scrollTo(...selectors: string[]): void {
    afterNextRender(
      () => {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Router (scrollPositionRestoration) tự cuộn lên đầu trang sau mỗi lần điều hướng,
        // nên chờ nó xong rồi mới cuộn tới đích, nếu không sẽ bị kéo ngược lên.
        setTimeout(() => {
          for (const selector of selectors) {
            const target = this.host.nativeElement.querySelector(selector);
            if (target) {
              target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
              return;
            }
          }
        }, 120);
      },
      { injector: this.injector },
    );
  }
}
