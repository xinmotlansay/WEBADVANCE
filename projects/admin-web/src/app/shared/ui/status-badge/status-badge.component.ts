import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LATE_COMPENSATION_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_TONE,
} from 'shared';

type BadgeKind = 'order' | 'payment' | 'return' | 'warranty' | 'shipment' | 'late' | 'customer';
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const LABELS: Record<BadgeKind, Record<string, string>> = {
  order: ORDER_STATUS_LABEL as unknown as Record<string, string>,
  payment: PAYMENT_STATUS_LABEL as unknown as Record<string, string>,
  return: RETURN_STATUS_LABEL as unknown as Record<string, string>,
  warranty: WARRANTY_STATUS_LABEL as unknown as Record<string, string>,
  shipment: SHIPMENT_STATUS_LABEL as unknown as Record<string, string>,
  late: LATE_COMPENSATION_LABEL as unknown as Record<string, string>,
  customer: { ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa' },
};

const TONES: Record<BadgeKind, Record<string, Tone>> = {
  order: ORDER_STATUS_TONE as unknown as Record<string, Tone>,
  payment: PAYMENT_STATUS_TONE as unknown as Record<string, Tone>,
  return: RETURN_STATUS_TONE as unknown as Record<string, Tone>,
  warranty: WARRANTY_STATUS_TONE as unknown as Record<string, Tone>,
  shipment: SHIPMENT_STATUS_TONE as unknown as Record<string, Tone>,
  late: { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' },
  customer: { ACTIVE: 'success', LOCKED: 'danger' },
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="cv-badge" [class]="'cv-badge cv-badge--' + tone()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly kind = input<BadgeKind>('order');
  readonly value = input.required<string>();

  readonly label = computed(() => LABELS[this.kind()][this.value()] ?? this.value());
  readonly tone = computed<Tone>(() => TONES[this.kind()][this.value()] ?? 'neutral');
}
