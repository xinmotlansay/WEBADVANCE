import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { AdminCustomer } from 'shared';
import { AdminCustomerApi } from '../../services/api/admin-customer.service';
import { loadAllPages } from '../../core/api/load-all-pages';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, OrderCodePipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../services/ui/notification.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { PaginationComponent } from '../../shared/ui/pagination/pagination.component';
import { DetailPopupComponent } from '../../shared/ui/popup/detail-popup.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  TableSkeletonComponent,
} from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-customers-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    PaginationComponent,
    DetailPopupComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    StatusBadgeComponent,
    OrderCodePipe,
    DateVnPipe,
    VndPipe,
    ShortVndPipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Khách hàng"
        subtitle="Tra cứu hồ sơ khách hàng và lịch sử mua. Order Admin chỉ xem, không sửa."
        searchId="customers-search"
        searchPlaceholder="Tên, SĐT hoặc email…"
        [searchValue]="keyword()"
        (searchChange)="onSearch($event)"
      >
        <button
          type="button"
          class="cv-btn cv-btn--secondary"
          (click)="load()"
          [disabled]="loading()"
        >
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
        <button
          type="button"
          class="cv-btn cv-btn--primary"
          (click)="exportCsv()"
          [disabled]="loading() || exporting()"
        >
          <app-icon name="download" size="sm" />
          {{ exporting() ? 'Đang xuất…' : 'Xuất danh sách' }}
        </button>
      </app-page-header>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5, 6]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="users"
          title="Không tìm thấy khách hàng"
          message="Thử tìm bằng số điện thoại hoặc email khác."
          actionLabel="Xóa tìm kiếm"
          (action)="resetSearch()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">
                Danh sách khách hàng
              </caption>
              <thead>
                <tr>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Liên hệ</th>
                  <th scope="col">Ngày tham gia</th>
                  <th scope="col" class="cv-table__cell--num">Số đơn</th>
                  <th scope="col" class="cv-table__cell--num">Tổng chi tiêu</th>
                  <th scope="col">Đơn gần nhất</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                @for (customer of items(); track customer.id) {
                  <tr>
                    <td>
                      <button
                        type="button"
                        class="cv-table__customer cv-table__link"
                        (click)="open(customer)"
                      >
                        <span class="cv-avatar" aria-hidden="true">{{
                          initials(customer.fullName)
                        }}</span>
                        {{ customer.fullName }}
                      </button>
                    </td>
                    <td>
                      <div>{{ customer.phoneNumber }}</div>
                      <div class="cv-small cv-muted">{{ customer.email || '—' }}</div>
                    </td>
                    <td class="cv-nowrap">{{ customer.joinedAt | dateVn }}</td>
                    <td class="cv-table__cell--num">{{ customer.orderCount }}</td>
                    <td class="cv-table__cell--num">{{ customer.totalSpent | vnd }}</td>
                    <td class="cv-nowrap">
                      {{ customer.lastOrderAt ? (customer.lastOrderAt | dateVn) : '—' }}
                    </td>
                    <td><app-status-badge kind="customer" [value]="customer.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination [meta]="meta()" (pageChange)="page.set($event); load()" />
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan khách hàng">
      <div class="cv-rail__hero">
        <p class="cv-label">Chi tiêu của trang</p>
        <p class="cv-hero-num">{{ pageSpent() | shortVnd }}</p>
        <p class="cv-small cv-muted">
          {{ items().length }} khách trên trang · {{ meta().total }} khách
        </p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Nhóm khách hàng</p>
        <ul class="cv-stack" style="gap: 10px; list-style: none; margin: 0; padding: 0">
          <li class="cv-spread cv-small">
            <span>Khách thân thiết (&ge; 3 đơn)</span><span class="cv-num">{{ loyalCount() }}</span>
          </li>
          <li class="cv-spread cv-small">
            <span>Khách mới</span><span class="cv-num">{{ newCount() }}</span>
          </li>
          <li class="cv-spread cv-small">
            <span>Tài khoản bị khóa</span><span class="cv-num">{{ lockedCount() }}</span>
          </li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Phạm vi quyền</p>
        <p class="cv-small cv-muted">
          Order Admin chỉ được xem hồ sơ và lịch sử mua để hỗ trợ đơn hàng. Không có quyền khóa, sửa
          hoặc xóa tài khoản khách.
        </p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Bảo mật dữ liệu</p>
        <p class="cv-small cv-muted">
          Không chia sẻ số điện thoại, địa chỉ hoặc lịch sử mua ra ngoài hệ thống. Mọi tra cứu đều
          được ghi nhật ký.
        </p>
      </div>
    </aside>

    @if (active(); as customer) {
      <app-detail-popup
        [open]="active() !== null"
        [title]="active() ? active()!.fullName : 'Hồ sơ khách hàng'"
        (closed)="active.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-spread">
            <app-status-badge kind="customer" [value]="customer.status" />
            <span class="cv-small cv-muted">Tham gia {{ customer.joinedAt | dateVn }}</span>
          </div>

          <dl class="cv-kv">
            <dt>Họ tên</dt>
            <dd>{{ customer.fullName }}</dd>
            <dt>Điện thoại</dt>
            <dd>{{ customer.phoneNumber }}</dd>
            <dt>Email</dt>
            <dd>{{ customer.email || '—' }}</dd>
            <dt>Số đơn</dt>
            <dd>{{ customer.orderCount }}</dd>
            <dt>Tổng chi tiêu</dt>
            <dd class="cv-num">{{ customer.totalSpent | vnd }}</dd>
            <dt>Đơn gần nhất</dt>
            <dd>{{ customer.lastOrderAt ? (customer.lastOrderAt | dateVn: 'datetime') : '—' }}</dd>
          </dl>

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Địa chỉ giao hàng</p>
            @for (address of customer.addresses; track address.addressLine) {
              <div class="address">
                <p class="cv-small" style="font-weight: 600">
                  {{ address.recipientName }} · {{ address.phone }}
                  @if (address.isDefault) {
                    <span class="cv-tag">Mặc định</span>
                  }
                </p>
                <p class="cv-small cv-muted">
                  {{ address.addressLine }}, {{ address.ward }}, {{ address.district }},
                  {{ address.province }}
                </p>
              </div>
            }
          </section>

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Đơn gần đây</p>
            @if (customer.recentOrders.length) {
              <table class="mini-table">
                <thead>
                  <tr>
                    <th scope="col">Mã đơn</th>
                    <th scope="col">Ngày</th>
                    <th scope="col" class="cv-right">Giá trị</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  @for (order of customer.recentOrders; track order.id) {
                    <tr>
                      <td>{{ order.orderCode | orderCode }}</td>
                      <td>{{ order.createdAt | dateVn }}</td>
                      <td class="cv-right cv-num">{{ order.totalAmount | vnd }}</td>
                      <td><app-status-badge kind="order" [value]="order.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="cv-small cv-muted">Khách chưa có đơn hàng.</p>
            }
          </section>

          <div class="cv-alert-box">
            Hồ sơ chỉ để tham khảo khi hỗ trợ đơn hàng. Không chỉnh sửa thông tin khách.
          </div>
        </div>
        <div popupFooter>
          <button
            type="button"
            class="cv-btn cv-btn--secondary cv-btn--block"
            (click)="active.set(null)"
          >
            Đóng hồ sơ
          </button>
        </div>
      </app-detail-popup>
    }
  `,
  styles: [
    `
      .address {
        padding: 10px 0;
        border-bottom: 1px solid var(--cv-border);
      }

      .address:last-child {
        border-bottom: 0;
      }

      .mini-table {
        font-size: 12px;
      }

      .mini-table th {
        text-align: left;
        font-weight: 500;
        color: var(--cv-muted);
        border-bottom: 1px solid var(--cv-border);
        padding: 6px 4px;
      }

      .mini-table td {
        padding: 8px 4px;
        border-bottom: 1px solid var(--cv-border);
      }

      .mini-table tr:last-child td {
        border-bottom: 0;
      }
    `,
  ],
})
export class CustomersScreenComponent {
  private readonly api = inject(AdminCustomerApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);

  readonly keyword = signal('');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly items = signal<AdminCustomer[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  readonly active = signal<AdminCustomer | null>(null);

  readonly pageSpent = computed(() =>
    this.items().reduce((sum, customer) => sum + customer.totalSpent, 0),
  );
  readonly loyalCount = computed(
    () => this.items().filter((customer) => customer.orderCount >= 3).length,
  );
  readonly newCount = computed(
    () => this.items().filter((customer) => customer.orderCount <= 1).length,
  );
  readonly lockedCount = computed(
    () => this.items().filter((customer) => customer.status === 'LOCKED').length,
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({ q: this.keyword() || undefined, page: this.page(), limit: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.data);
          this.meta.set(response.meta);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được danh sách khách hàng.');
          this.loading.set(false);
        },
      });
  }

  onSearch(value: string): void {
    this.keyword.set(value);
    this.page.set(1);
    this.load();
  }

  resetSearch(): void {
    this.keyword.set('');
    this.page.set(1);
    this.load();
  }

  exportCsv(): void {
    if (this.exporting()) return;

    const query = { q: this.keyword() || undefined };
    this.exporting.set(true);
    loadAllPages((page, limit) => this.api.list({ ...query, page, limit }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customers) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Họ tên', value: (customer) => customer.fullName },
              { label: 'Email', value: (customer) => customer.email },
              { label: 'Số điện thoại', value: (customer) => customer.phoneNumber },
              { label: 'Ngày tham gia', value: (customer) => customer.joinedAt },
              { label: 'Trạng thái', value: (customer) => customer.status },
              { label: 'Số đơn hàng', value: (customer) => customer.orderCount },
              { label: 'Tổng chi tiêu', value: (customer) => customer.totalSpent },
              { label: 'Đơn gần nhất', value: (customer) => customer.lastOrderAt },
            ],
            customers,
          );
          this.notifications.show(
            downloaded
              ? `Đã tải xuống ${customers.length} khách hàng.`
              : 'Không có khách hàng phù hợp để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được danh sách khách hàng để xuất file.', 'error');
        },
      });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  open(customer: AdminCustomer): void {
    this.active.set(customer);
  }
}
