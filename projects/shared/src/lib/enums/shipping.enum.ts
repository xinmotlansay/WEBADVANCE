import type { OrderBadgeTone } from './order.enum';

export enum ShipmentStatus {
  PENDING = 'PENDING',
  HANDED_OVER = 'HANDED_OVER',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RETURNING = 'RETURNING',
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  [ShipmentStatus.PENDING]: 'Chờ bàn giao',
  [ShipmentStatus.HANDED_OVER]: 'Đã bàn giao',
  [ShipmentStatus.SHIPPING]: 'Đang giao',
  [ShipmentStatus.DELIVERED]: 'Đã giao',
  [ShipmentStatus.DELIVERY_FAILED]: 'Giao thất bại',
  [ShipmentStatus.RETURNING]: 'Đang hoàn hàng',
};

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, OrderBadgeTone> = {
  [ShipmentStatus.PENDING]: 'neutral',
  [ShipmentStatus.HANDED_OVER]: 'info',
  [ShipmentStatus.SHIPPING]: 'info',
  [ShipmentStatus.DELIVERED]: 'success',
  [ShipmentStatus.DELIVERY_FAILED]: 'danger',
  [ShipmentStatus.RETURNING]: 'warning',
};

export enum DeliverySlot {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
}

export const DELIVERY_SLOT_LABEL: Record<DeliverySlot, string> = {
  [DeliverySlot.MORNING]: 'Sáng 8–12',
  [DeliverySlot.AFTERNOON]: 'Chiều 13–17',
};

export const SHIPPING_TIER_LABEL: Record<number, string> = {
  1: 'Cấp 1 – Nhỏ',
  2: 'Cấp 2 – Vừa',
  3: 'Cấp 3 – Lớn (cồng kềnh)',
  4: 'Cấp 4 – Rất lớn (cồng kềnh)',
};

export const CARAVESO_CARRIER = 'CaraVeso';

export const MAX_REDELIVERY_COUNT = 2;
