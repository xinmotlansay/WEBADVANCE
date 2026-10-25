import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TimelineEntry } from 'shared';
export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  RECEIVED: 'Đã tiếp nhận',
  INSPECTING: 'Đang kiểm tra',
  IN_WARRANTY: 'Đang bảo hành',
  CONFIRMED: 'Đã xác nhận',
  AWAITING_GOODS: 'Chờ nhận hàng',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};
@Component({
  selector: 'app-request-timeline',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-timeline.component.html',
  styleUrl: './request-timeline.component.css',
})
export class RequestTimelineComponent {
  readonly entries = input<TimelineEntry[]>([]);
  protected readonly labels = STATUS_LABELS;
}
