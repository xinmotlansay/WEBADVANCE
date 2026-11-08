import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';
import { AccountApiService, type AccountOrder, type ReviewableItem } from './account-api.service';

/**
 * Sản phẩm chờ đánh giá: dòng hàng của đơn `DELIVERED` có `actions.canReview` (API Design 3.1).
 * Dùng chung giữa trang Đánh giá và số đếm trên thanh bên.
 */
@Injectable({ providedIn: 'root' })
export class ReviewQueueService {
  private readonly api = inject(AccountApiService);

  readonly pending = signal<ReviewableItem[]>([]);

  /** Nạp lại hàng đợi; lỗi thì coi như không có gì chờ. */
  refresh(): Observable<ReviewableItem[]> {
    return this.api.orders(20, 'DELIVERED').pipe(
      map((orders) => orders.flatMap((order) => this.toItems(order))),
      catchError(() => of<ReviewableItem[]>([])),
      map((items) => {
        this.pending.set(items);
        return items;
      }),
    );
  }

  private toItems(order: AccountOrder): ReviewableItem[] {
    const deliveredAt =
      order.shipment?.actualDeliveryDate ??
      order.statusHistory.find((change) => change.toStatus === 'DELIVERED')?.changedAt ??
      order.createdAt;
    return order.items.flatMap((item, index) =>
      item.actions.canReview
        ? [
            {
              orderId: order.id,
              orderItemId: item.id,
              orderCode: order.orderCode,
              deliveredAt,
              productId: null,
              image: order.thumbnails[index] ?? '',
              name: item.snapshot.name,
              color: item.snapshot.color ?? '',
              sku: item.snapshot.sku,
            },
          ]
        : [],
    );
  }
}
