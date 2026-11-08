import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TimelineEntry } from 'shared';
import { AccountIconComponent, type IconName } from '../../../features/account/account-icon.component';
export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  RECEIVED: 'Đã tiếp nhận',
  INSPECTING: 'Đang kiểm tra',
  IN_WARRANTY: 'Đang bảo hành',
  CONFIRMED: 'Đã xác nhận',
  AWAITING_GOODS: 'Chờ nhận hàng',
  PROCESSING: 'Đang xử lý',
  AWAITING_REFUND: 'Chờ hoàn tiền',
  REFUNDING: 'Đang hoàn tiền',
  COMPLETED: 'Hoàn tất',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};
const STATUS_ICONS: Record<string, IconName> = {
  PENDING: 'clock',
  PENDING_CONFIRMATION: 'clock',
  RECEIVED: 'clipboard-check',
  CONFIRMED: 'clipboard-check',
  INSPECTING: 'search',
  IN_WARRANTY: 'wrench',
  AWAITING_GOODS: 'truck',
  PROCESSING: 'wrench',
  AWAITING_REFUND: 'clock',
  REFUNDING: 'package',
  COMPLETED: 'package',
  REJECTED: 'x-circle',
  CANCELLED: 'x-circle',
};

@Component({
  selector: 'app-request-timeline',
  imports: [DatePipe, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-timeline.component.html',
  styleUrl: './request-timeline.component.css',
})
export class RequestTimelineComponent {
  readonly entries = input<TimelineEntry[]>([]);
  protected readonly labels = STATUS_LABELS;
  protected icon(status: string): IconName {
    return STATUS_ICONS[status] ?? 'clock';
  }
}
